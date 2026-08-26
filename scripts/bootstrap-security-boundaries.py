from pathlib import Path

# Replace the body reader with an incremental bounded reader so missing/false
# Content-Length cannot force unbounded buffering before SeenRelay rejects input.
Path('src/http.ts').write_text("""import { ValidationError } from './canonical.js';

async function readBodyBytes(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive finite number');
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) throw new ValidationError(`request body exceeds ${maxBytes} bytes`);
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('SeenRelay request body limit exceeded');
        throw new ValidationError(`request body exceeds ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readBodyBytes(request, maxBytes);
  if (!bytes.byteLength) throw new ValidationError('request body is required');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try { return JSON.parse(text) as T; } catch { throw new ValidationError('request body must be valid JSON'); }
}

/**
 * Rebuild a request after incrementally enforcing the SeenRelay-owned body limit.
 * Used before handing POST bodies to protocol SDKs that otherwise own parsing.
 */
export async function limitRequestBody(request: Request, maxBytes: number): Promise<Request> {
  if (!request.body) return request;
  const url = request.url;
  const method = request.method;
  const headers = new Headers(request.headers);
  const signal = request.signal;
  const bytes = await readBodyBytes(request, maxBytes);
  return new Request(url, { method, headers, body: bytes, signal });
}

export function requestId(request: Request): string { return request.headers.get('x-vercel-id') || crypto.randomUUID(); }
""")

admin = Path('src/admin.ts').read_text()
if "from './http.js'" not in admin:
    admin = admin.replace("import { hiveSigningRotationState } from './hive.js';", "import { hiveSigningRotationState } from './hive.js';\nimport { readJsonBody } from './http.js';")
admin = admin.replace("String(((await request.json()) as {secret?:unknown})?.secret||'')", "String(((await readJsonBody<{secret?:unknown}>(request, config().maxBodyBytes))?.secret)||'')")
admin = admin.replace("body=await request.json() as Record<string,unknown>", "body=await readJsonBody<Record<string,unknown>>(request, config().maxBodyBytes)")
admin = admin.replace("body=await request.json() as {playbook?:unknown}", "body=await readJsonBody<{playbook?:unknown}>(request, config().maxBodyBytes)")
Path('src/admin.ts').write_text(admin)

index = Path('src/index.ts').read_text()
index = index.replace("import { readJsonBody, requestId } from './http.js';", "import { limitRequestBody, readJsonBody, requestId } from './http.js';")
index = index.replace("app.all('/mcp', (c) => handleMcp(c.req.raw));", "app.all('/mcp', async (c) => handleMcp(await limitRequestBody(c.req.raw, config().maxBodyBytes)));")
Path('src/index.ts').write_text(index)

Path('tests/http-security.test.ts').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../src/canonical.js';
import { limitRequestBody, readJsonBody } from '../src/http.js';

test('bounded JSON reader rejects declared oversized requests before parsing', async () => {
  const request = new Request('https://seenrelay.test/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': '9999' },
    body: '{}'
  });
  await assert.rejects(() => readJsonBody(request, 128), (error: unknown) => error instanceof ValidationError && /exceeds 128 bytes/.test(error.message));
});

test('bounded JSON reader rejects oversized streamed input even without Content-Length', async () => {
  const request = new Request('https://seenrelay.test/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value: 'x'.repeat(512) })
  });
  request.headers.delete('content-length');
  await assert.rejects(() => readJsonBody(request, 64), (error: unknown) => error instanceof ValidationError && /exceeds 64 bytes/.test(error.message));
});

test('protocol body limiter preserves a bounded MCP POST body and request headers', async () => {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const request = new Request('https://seenrelay.test/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'x-test': 'preserve' },
    body: payload
  });
  const bounded = await limitRequestBody(request, 4096);
  assert.equal(bounded.method, 'POST');
  assert.equal(bounded.headers.get('x-test'), 'preserve');
  assert.equal(await bounded.text(), payload);
});
""")

Path('tests/security-boundaries.test.mjs').write_text("""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

test('admin JSON inputs use the shared bounded reader', () => {
  const admin = read('src/admin.ts');
  assert.match(admin, /readJsonBody<\{secret\?:unknown\}>/);
  assert.match(admin, /readJsonBody<Record<string,unknown>>/);
  assert.match(admin, /readJsonBody<\{playbook\?:unknown\}>/);
  assert.doesNotMatch(admin, /await request\.json\(\)/);
});

test('MCP enters the SDK only after SeenRelay-owned body limiting', () => {
  const index = read('src/index.ts');
  assert.match(index, /handleMcp\(await limitRequestBody\(c\.req\.raw, config\(\)\.maxBodyBytes\)\)/);
});
""")
print('Security request-boundary bootstrap complete')
