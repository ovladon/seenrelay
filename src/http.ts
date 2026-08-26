import { ValidationError } from './canonical.js';

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) throw new ValidationError(`request body exceeds ${maxBytes} bytes`);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new ValidationError(`request body exceeds ${maxBytes} bytes`);
  if (!text) throw new ValidationError('request body is required');
  try { return JSON.parse(text) as T; } catch { throw new ValidationError('request body must be valid JSON'); }
}

export type BoundedRequestResult = { request: Request } | { response: Response };

/**
 * Rebuilds a request only after reading at most maxBytes+1 bytes. This protects endpoints whose
 * downstream SDK needs the Request body intact (notably MCP) while still enforcing a transport-level
 * body ceiling even when Content-Length is absent or untrusted.
 */
export async function boundedRequest(request: Request, maxBytes: number): Promise<BoundedRequestResult> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return { request };
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared < 0 || declared > maxBytes) {
      return { response: new Response(JSON.stringify({ error: { code: 'REQUEST_TOO_LARGE', detail: `Request body exceeds ${maxBytes} bytes.` } }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }) };
    }
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('request body exceeds configured limit');
        return { response: new Response(JSON.stringify({ error: { code: 'REQUEST_TOO_LARGE', detail: `Request body exceeds ${maxBytes} bytes.` } }), { status: 413, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } }) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new ArrayBuffer(total);
  const bodyView = new Uint8Array(body);
  let offset = 0;
  for (const chunk of chunks) { bodyView.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  return { request: new Request(request.url, { method: request.method, headers, body, signal: request.signal }) };
}

export function requestId(request: Request): string { return request.headers.get('x-vercel-id') || crypto.randomUUID(); }
