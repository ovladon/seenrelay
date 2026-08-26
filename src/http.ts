import { ValidationError } from './canonical.js';

export class PayloadTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`request body exceeds ${maxBytes} bytes`);
    this.name = 'PayloadTooLargeError';
  }
}

async function readBoundedBytes(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const declared = Number(contentLength);
    if (Number.isFinite(declared) && declared > maxBytes) throw new PayloadTooLargeError(maxBytes);
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
        throw new PayloadTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const bytes = await readBoundedBytes(request, maxBytes);
  if (!bytes.byteLength) throw new ValidationError('request body is required');
  const text = new TextDecoder().decode(bytes);
  try { return JSON.parse(text) as T; }
  catch { throw new ValidationError('request body must be valid JSON'); }
}

/**
 * Consume at most maxBytes from a request body, then reconstruct a request for downstream parsers.
 * This prevents chunked/unknown-length bodies from bypassing Content-Length checks.
 */
export async function boundedRequest(request: Request, maxBytes: number): Promise<Request> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return request;
  const bytes = await readBoundedBytes(request, maxBytes);
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bytes.byteLength ? bytes : undefined,
    redirect: request.redirect,
    signal: request.signal
  });
}

export function requestId(request: Request): string {
  return request.headers.get('x-vercel-id') || crypto.randomUUID();
}
