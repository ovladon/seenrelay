const HEADER = 'x-seenrelay-internal-telemetry';
const DOMAIN = 'seenrelay-internal-telemetry-v1';
const MAX_SKEW_SECONDS = 300;

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

function decodeBase64url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    const raw = atob(padded);
    return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

function configuredSecret(): string | null {
  const value = process.env.INTERNAL_TELEMETRY_SECRET?.trim() || '';
  return value.length >= 32 ? value : null;
}

function signingPayload(request: Request, timestampSeconds: number): string {
  const url = new URL(request.url);
  const clientHint = request.headers.get('x-seenrelay-client')?.trim() || '';
  return `${DOMAIN}\n${timestampSeconds}\n${request.method.toUpperCase()}\n${url.pathname}\n${clientHint}`;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
}

/**
 * Optional server-verified marker used only to keep first-party Production probes out of adoption
 * classification. Invalid, absent or stale markers fail open to ordinary/unclassified traffic and
 * never authorize, reject or otherwise change a domain operation.
 */
export async function isVerifiedInternalTelemetry(request: Request, nowMs = Date.now()): Promise<boolean> {
  const secret = configuredSecret();
  if (!secret) return false;
  const raw = request.headers.get(HEADER)?.trim() || '';
  const match = /^v1\.(\d{10})\.([A-Za-z0-9_-]{40,60})$/.exec(raw);
  if (!match) return false;
  const timestampSeconds = Number(match[1]);
  if (!Number.isSafeInteger(timestampSeconds)) return false;
  if (Math.abs(Math.floor(nowMs / 1000) - timestampSeconds) > MAX_SKEW_SECONDS) return false;
  const signature = decodeBase64url(match[2]);
  if (!signature || signature.byteLength !== 32) return false;
  try {
    return await crypto.subtle.verify(
      'HMAC',
      await importKey(secret),
      signature,
      bytes(signingPayload(request, timestampSeconds))
    );
  } catch {
    return false;
  }
}

export function internalTelemetryClassifierState(): { configured: boolean; max_skew_seconds: number } {
  return { configured: Boolean(configuredSecret()), max_skew_seconds: MAX_SKEW_SECONDS };
}
