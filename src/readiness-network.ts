import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { isIP } from 'node:net';

export type PinnedAddress = { address: string; family: 4 | 6 };

export type BoundedGetResult = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
  elapsedMs: number;
};

type BoundedGetOptions = {
  path: string;
  maxBytes: number;
  timeoutMs: number;
  userAgent: string;
  accept?: string;
};

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const values = parts.map((part) => Number(part));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return values;
}

export function isGlobalPublicIp(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const p = parseIpv4(address);
    if (!p) return false;
    const [a, b, c] = p;
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 0 && c === 0) return false;
    if (a === 192 && b === 0 && c === 2) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    if (a >= 224) return false;
    return true;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value.startsWith('::ffff:')) return isGlobalPublicIp(value.slice('::ffff:'.length));
    const first = value[0];
    if (first !== '2' && first !== '3') return false;
    if (value.startsWith('2001:db8:') || value === '2001:db8::') return false;
    return true;
  }
  return false;
}

export function normalizeAuditTarget(input: string): URL {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 253) throw new Error('Enter a hostname or HTTPS site origin.');
  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Enter a valid hostname or HTTPS site origin.');
  }
  if (url.protocol !== 'https:') throw new Error('Only HTTPS sites can be audited.');
  if (url.username || url.password) throw new Error('Credentials in the URL are not allowed.');
  if (url.port && url.port !== '443') throw new Error('Only the default HTTPS port is allowed.');
  if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
    throw new Error('Enter the site origin only, without a path, query, or fragment.');
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Local or internal hostnames are not allowed.');
  }
  if (isIP(hostname)) throw new Error('Enter a public DNS hostname, not an IP address.');
  return new URL(`https://${hostname}/`);
}

export async function resolvePinnedPublicAddress(hostname: string): Promise<PinnedAddress> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length) throw new Error('DNS returned no addresses for this hostname.');
  for (const answer of answers) {
    if (!isGlobalPublicIp(answer.address)) throw new Error('The hostname resolves to a non-public or special-purpose address.');
  }
  const preferred = answers.find((answer) => answer.family === 4) || answers.find((answer) => answer.family === 6);
  if (!preferred || (preferred.family !== 4 && preferred.family !== 6)) throw new Error('No supported public address was returned.');
  return { address: preferred.address, family: preferred.family };
}

function assertBoundedPath(path: string): void {
  if (!path.startsWith('/') || path.includes('?') || path.includes('#') || path.includes('\\')) {
    throw new Error('Invalid bounded readiness path.');
  }
  const normalized = new URL(path, 'https://seenrelay.invalid');
  if (normalized.origin !== 'https://seenrelay.invalid' || normalized.pathname !== path) {
    throw new Error('Invalid bounded readiness path.');
  }
}

export function boundedPinnedGet(url: URL, pinned: PinnedAddress, options: BoundedGetOptions): Promise<BoundedGetResult> {
  assertBoundedPath(options.path);
  if (!Number.isInteger(options.maxBytes) || options.maxBytes < 1 || options.maxBytes > 262_144) {
    throw new Error('Invalid bounded readiness byte cap.');
  }
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 250 || options.timeoutMs > 5_000) {
    throw new Error('Invalid bounded readiness timeout.');
  }
  if (!isGlobalPublicIp(pinned.address) || (pinned.family !== 4 && pinned.family !== 6)) {
    throw new Error('Invalid pinned public address.');
  }

  return new Promise((resolve, reject) => {
    const started = performance.now();
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let settled = false;
    const finish = (result: BoundedGetResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      family: pinned.family,
      path: options.path,
      method: 'GET',
      servername: url.hostname,
      headers: {
        'user-agent': options.userAgent,
        accept: options.accept || 'text/html,application/json,text/plain;q=0.8,*/*;q=0.2',
        'accept-encoding': 'identity',
        connection: 'close'
      },
      lookup: (_hostname, _lookupOptions, callback) => {
        callback(null, pinned.address, pinned.family);
      }
    }, (response) => {
      response.on('data', (chunk: Buffer | string) => {
        if (truncated) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = options.maxBytes - size;
        if (buffer.length > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          size = options.maxBytes;
          truncated = true;
          response.destroy();
          return;
        }
        chunks.push(buffer);
        size += buffer.length;
      });
      response.on('end', () => finish({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks),
        truncated,
        elapsedMs: performance.now() - started
      }));
      response.on('close', () => {
        if (truncated) finish({
          status: response.statusCode || 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
          truncated: true,
          elapsedMs: performance.now() - started
        });
      });
    });
    req.setTimeout(options.timeoutMs, () => req.destroy(new Error('The site did not respond within the audit timeout.')));
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    req.end();
  });
}
