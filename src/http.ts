import { ValidationError } from './canonical.js';

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
