import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';
import { readinessPresentationPage, readinessSurfaceDescriptor } from '../src/readiness-presentation.js';

test('readiness machine descriptor keeps v1 default and v2 activation-gated', () => {
  const descriptor = readinessSurfaceDescriptor('https://seenrelay.test', false);
  assert.equal(descriptor.schema, 'seenrelay-readiness-presentation-v1');
  assert.equal(descriptor.defaultBrowserAudit, 'v1');
  assert.equal(descriptor.audits.v1.enabled, true);
  assert.equal(descriptor.audits.v1.requestCount, 1);
  assert.equal(descriptor.audits.v2.enabled, false);
  assert.equal(descriptor.audits.v2.availability, 'activation-gated');
  assert.equal(descriptor.audits.v2.requestCount, 6);
  assert.equal(descriptor.audits.v2.retries, 0);
  assert.equal(descriptor.audits.v2.totalMaxBytes, 786432);
  assert.equal(descriptor.principles.surfaceScanEstablishesSeenRelayFit, false);
  assert.deepEqual(descriptor.principles.coreMcpOperations, ['CHECK', 'OBSERVE']);
});

test('enabling v2 exposes it as optional without changing browser default', () => {
  const descriptor = readinessSurfaceDescriptor('https://seenrelay.test', true);
  assert.equal(descriptor.defaultBrowserAudit, 'v1');
  assert.equal(descriptor.audits.v2.enabled, true);
  assert.equal(descriptor.audits.v2.availability, 'enabled');
  const html = readinessPresentationPage('https://seenrelay.test', true);
  assert.match(html, /data-v2-enabled="true"/);
  assert.match(html, /id="readiness-use-v2"/);
  assert.match(html, /6 fixed same-origin GETs/);
});

test('disabled v2 presentation does not offer the extended audit control', () => {
  const html = readinessPresentationPage('https://seenrelay.test', false);
  assert.match(html, /data-v2-enabled="false"/);
  assert.doesNotMatch(html, /id="readiness-use-v2"/);
  assert.match(html, /href="\/readiness\.json">Readiness JSON/);
});

test('GET /readiness content-negotiates HTML and machine JSON without executing an audit', async () => {
  const previousEnabled = process.env.READINESS_V2_ENABLED;
  const previousCovered = process.env.READINESS_V2_COST_COVERED;
  delete process.env.READINESS_V2_ENABLED;
  delete process.env.READINESS_V2_COST_COVERED;
  try {
    const machine = await app.request('https://seenrelay.test/readiness', { headers: { accept: 'application/json' } });
    assert.equal(machine.status, 200);
    assert.match(machine.headers.get('content-type') || '', /application\/json/);
    assert.equal(machine.headers.get('vary'), 'Accept');
    const descriptor = await machine.json() as any;
    assert.equal(descriptor.schema, 'seenrelay-readiness-presentation-v1');
    assert.equal(descriptor.audits.v2.enabled, false);

    const explicitMachine = await app.request('https://seenrelay.test/readiness.json');
    assert.equal(explicitMachine.status, 200);
    assert.equal((await explicitMachine.json() as any).schema, 'seenrelay-readiness-presentation-v1');

    const human = await app.request('https://seenrelay.test/readiness', { headers: { accept: 'text/html' } });
    assert.equal(human.status, 200);
    assert.match(human.headers.get('content-type') || '', /text\/html/);
    assert.match(await human.text(), /data-v2-enabled="false"/);
  } finally {
    if (previousEnabled === undefined) delete process.env.READINESS_V2_ENABLED; else process.env.READINESS_V2_ENABLED = previousEnabled;
    if (previousCovered === undefined) delete process.env.READINESS_V2_COST_COVERED; else process.env.READINESS_V2_COST_COVERED = previousCovered;
  }
});
