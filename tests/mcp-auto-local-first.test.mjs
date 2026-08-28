import test from 'node:test';
import assert from 'node:assert/strict';
import { protectMcpClient } from '../clients/typescript/dist/mcp-auto.js';

function fakeClient() {
  return {
    calls: 0,
    otherCalls: 0,
    async callTool(params, options) {
      this.calls += 1;
      return { seq: this.calls, name: params.name, args: params.arguments, optionMarker: options?.marker };
    },
    ping() { this.otherCalls += 1; return this.otherCalls; }
  };
}

test('one MCP binding locally reuses only an explicitly allowlisted tool with explicit TTL', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, {
    serverKey: 'example-server',
    tools: { 'catalog.read': { maxAgeMs: 60_000 } }
  });
  const first = await client.callTool({ name: 'catalog.read', arguments: { id: 7 } });
  const second = await client.callTool({ name: 'catalog.read', arguments: { id: 7 } });
  assert.deepEqual(first, second);
  assert.equal(raw.calls, 1);
  assert.equal(client.seenRelayZeroState.getTelemetry().edge.relayCheckCalls, 0);
});

test('unlisted tool calls pass through every time', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, { tools: { 'catalog.read': { maxAgeMs: 60_000 } } });
  const a = await client.callTool({ name: 'catalog.update', arguments: { id: 7 } });
  const b = await client.callTool({ name: 'catalog.update', arguments: { id: 7 } });
  assert.notDeepEqual(a, b);
  assert.equal(raw.calls, 2);
  assert.equal(client.seenRelayZeroState.getTelemetry().passthroughCalls, 2);
});

test('default tool TTL zero does not reuse sequential completed results', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, { tools: { 'catalog.read': {} } });
  const a = await client.callTool({ name: 'catalog.read', arguments: { id: 7 } });
  const b = await client.callTool({ name: 'catalog.read', arguments: { id: 7 } });
  assert.notDeepEqual(a, b);
  assert.equal(raw.calls, 2);
  assert.equal(client.seenRelayZeroState.getTelemetry().edge.cacheEntries, 0);
});

test('simultaneous exact MCP calls coalesce even with completed-result TTL zero', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const raw = {
    calls: 0,
    async callTool(params) { this.calls += 1; await gate; return { name: params.name, id: params.arguments.id }; }
  };
  const client = protectMcpClient(raw, { tools: { 'catalog.read': {} } });
  const a = client.callTool({ name: 'catalog.read', arguments: { id: 9 } });
  const b = client.callTool({ name: 'catalog.read', arguments: { id: 9 } });
  release();
  assert.deepEqual(await a, await b);
  assert.equal(raw.calls, 1);
  assert.equal(client.seenRelayZeroState.getTelemetry().edge.inflightCoalesced, 1);
});

test('different MCP arguments never collapse under the default identity', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, { tools: { 'catalog.read': { maxAgeMs: 60_000 } } });
  const a = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } });
  const b = await client.callTool({ name: 'catalog.read', arguments: { id: 2 } });
  assert.equal(a.args.id, 1);
  assert.equal(b.args.id, 2);
  assert.equal(raw.calls, 2);
});

test('callTool request options pass through unless custom identity explicitly handles them', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, { tools: { 'catalog.read': { maxAgeMs: 60_000 } } });
  const a = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } }, { marker: 'a' });
  const b = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } }, { marker: 'a' });
  assert.notDeepEqual(a, b);
  assert.equal(raw.calls, 2);
  assert.equal(client.seenRelayZeroState.getTelemetry().optionPassthroughCalls, 2);
});

test('custom identity can explicitly include request-option semantics', async () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, {
    serverKey: 'example-server',
    tools: {
      'catalog.read': {
        maxAgeMs: 60_000,
        coordinate: (params, rest) => ({ server: 'example-server', name: params.name, args: params.arguments, marker: rest[0]?.marker })
      }
    }
  });
  const a = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } }, { marker: 'a' });
  const b = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } }, { marker: 'a' });
  const c = await client.callTool({ name: 'catalog.read', arguments: { id: 1 } }, { marker: 'b' });
  assert.deepEqual(a, b);
  assert.notDeepEqual(b, c);
  assert.equal(raw.calls, 2);
});

test('non-callTool methods remain correctly bound to the underlying client', () => {
  const raw = fakeClient();
  const client = protectMcpClient(raw, { tools: {} });
  assert.equal(client.ping(), 1);
  assert.equal(client.ping(), 2);
  assert.equal(raw.otherCalls, 2);
});
