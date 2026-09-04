import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const VERSION = 1;
const RESOURCE_REVISION = 'preview-http-fixture-v1';
const ETAG = `"${createHash('sha256').update(RESOURCE_REVISION).digest('hex')}"`;
const LARGE_PAYLOAD = 'x'.repeat(64 * 1024);

function timingHeader(started: number, cpuStarted: NodeJS.CpuUsage) {
  const duration = Math.max(0.001, performance.now() - started);
  const cpu = process.cpuUsage(cpuStarted);
  const cpuMs = Math.max(0.001, (cpu.user + cpu.system) / 1000);
  return `app;dur=${duration.toFixed(3)}, cpu;dur=${cpuMs.toFixed(3)}`;
}

function baseHeaders(started: number, cpuStarted: NodeJS.CpuUsage) {
  return {
    'cache-control': 'no-store',
    etag: ETAG,
    'server-timing': timingHeader(started, cpuStarted),
    vary: 'Accept',
    'x-seenrelay-fixture-revision': RESOURCE_REVISION
  };
}

function acceptsText(request: Request) {
  const accept = request.headers.get('accept') || '*/*';
  return accept.split(',').some((item) => item.trim().toLowerCase().startsWith('text/plain'));
}

export default {
  fetch(request: Request) {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();

    if (process.env.VERCEL_ENV === 'production') {
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('method not allowed', {
        status: 405,
        headers: {
          allow: 'GET, HEAD',
          'cache-control': 'no-store',
          'server-timing': timingHeader(started, cpuStarted)
        }
      });
    }

    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch === ETAG) {
      return new Response(null, { status: 304, headers: baseHeaders(started, cpuStarted) });
    }

    if (acceptsText(request)) {
      const body = `version=${VERSION}\n`;
      return new Response(request.method === 'HEAD' ? null : body, {
        status: 200,
        headers: { ...baseHeaders(started, cpuStarted), 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    const body = JSON.stringify({ version: VERSION, payload: LARGE_PAYLOAD });
    return new Response(request.method === 'HEAD' ? null : body, {
      status: 200,
      headers: { ...baseHeaders(started, cpuStarted), 'content-type': 'application/json; charset=utf-8' }
    });
  }
};
