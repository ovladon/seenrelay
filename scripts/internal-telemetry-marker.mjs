import { createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DOMAIN = 'seenrelay-internal-telemetry-v1';

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

export function internalTelemetryMarker({
  secret = process.env.INTERNAL_TELEMETRY_SECRET || '',
  method,
  path,
  clientHint = '',
  now = new Date(),
} = {}) {
  const cleanSecret = String(secret).trim();
  if (cleanSecret.length < 32) throw new Error('INTERNAL_TELEMETRY_SECRET must contain at least 32 characters');
  const cleanMethod = String(method || '').trim().toUpperCase();
  if (!cleanMethod) throw new Error('method is required');
  const cleanPath = String(path || '').trim();
  if (!cleanPath.startsWith('/') || cleanPath.includes('?') || cleanPath.includes('#')) {
    throw new Error('path must be an origin-relative pathname without query or fragment');
  }
  const timestampSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(timestampSeconds)) throw new Error('now must be a valid date');
  const payload = `${DOMAIN}\n${timestampSeconds}\n${cleanMethod}\n${cleanPath}\n${String(clientHint).trim()}`;
  const signature = b64url(createHmac('sha256', cleanSecret).update(payload).digest());
  return `v1.${timestampSeconds}.${signature}`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error('Use --method METHOD --path /path [--client CLIENT_HINT]');
    out[key.slice(2)] = value;
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(`${internalTelemetryMarker({ method: args.method, path: args.path, clientHint: args.client || '' })}\n`);
}
