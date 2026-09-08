import { Hono } from 'hono';
import { boundedRequest, readJsonBody, requestId } from './http.js';
import { auditPublicRoot } from './readiness.js';
import { readinessPresentationPage, readinessSurfaceDescriptor } from './readiness-presentation.js';
import { ReadinessV2ActivationError, readinessV2ActivationState, runActivatedReadinessV2 } from './readiness-v2-activation.js';
import { SERVICE_RELEASE } from './version.js';

function readinessServiceDescriptor(origin: string) {
  const activation = readinessV2ActivationState();
  return {
    schema: 'seenrelay-readiness-service-v1' as const,
    service: 'SeenRelay Readiness',
    human: `${origin}/readiness`,
    machine: `${origin}/readiness.json`,
    openapi: `${origin}/openapi.json`,
    v1: { endpoint: `${origin}/readiness/audit`, enabled: true as const },
    v2: { endpoint: `${origin}/readiness/audit/v2`, enabled: activation.enabled },
    core_operations_exposed: false as const
  };
}

function readinessOpenApi(origin: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SeenRelay Readiness',
      version: SERVICE_RELEASE,
      description: 'Bounded, native-first site readiness audits. This service does not expose SeenRelay CHECK, OBSERVE, MCP, admin, billing or maintenance routes.'
    },
    servers: [{ url: origin }],
    paths: {
      '/readiness': { get: { summary: 'Human and machine readiness entry point', responses: { '200': { description: 'Readiness presentation or descriptor' } } } },
      '/readiness.json': { get: { summary: 'Readiness machine descriptor', responses: { '200': { description: 'Readiness descriptor' } } } },
      '/readiness/audit': {
        post: {
          summary: 'Run the bounded v1 root audit',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['site'], properties: { site: { type: 'string' } } } } } },
          responses: { '200': { description: 'v1 readiness report' }, '400': { description: 'Invalid request' }, '422': { description: 'Audit unavailable' } }
        }
      },
      '/readiness/audit/v2': {
        post: {
          summary: 'Run the activation-gated bounded v2 audit',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['site'], properties: { site: { type: 'string' } } } } } },
          responses: { '200': { description: 'v2 readiness report' }, '400': { description: 'Invalid request' }, '429': { description: 'Capacity exhausted' }, '503': { description: 'v2 disabled' } }
        }
      },
      '/healthz': { get: { summary: 'Readiness service health', responses: { '200': { description: 'Service health' } } } }
    }
  };
}

function safeAuditDetail(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : '';
  return /^(Enter|Only|Credentials|Local|The hostname|DNS returned|No supported)/.test(message) ? message : fallback;
}

export function createReadinessServiceApp() {
  const app = new Hono();

  app.use('*', async (c, next) => {
    const rid = requestId(c.req.raw);
    c.header('x-request-id', rid);
    c.header('x-content-type-options', 'nosniff');
    c.header('x-frame-options', 'DENY');
    c.header('referrer-policy', 'no-referrer');
    c.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    c.header('cache-control', 'no-store');
    if (process.env.VERCEL_ENV === 'production') c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    await next();
  });

  app.onError((err, c) => {
    const rid = c.res.headers.get('x-request-id') || c.req.header('x-vercel-id') || 'unknown';
    console.error(JSON.stringify({ event: 'readiness_error', request_id: rid, path: c.req.path, error: err instanceof Error ? err.message : 'unknown' }));
    return c.json({ error: { code: 'INTERNAL_ERROR', detail: 'Request could not be completed.' } }, 500);
  });

  app.get('/', (c) => {
    const origin = new URL(c.req.url).origin;
    const accept = c.req.header('accept') || '';
    c.header('vary', 'Accept');
    if (accept.includes('text/html')) return c.redirect('/readiness', 302);
    return c.json(readinessServiceDescriptor(origin));
  });

  app.get('/readiness', (c) => {
    const origin = new URL(c.req.url).origin;
    const v2Enabled = readinessV2ActivationState().enabled;
    const accept = c.req.header('accept') || '';
    c.header('vary', 'Accept');
    c.header('cache-control', 'public, max-age=60');
    if (!accept.includes('text/html')) return c.json(readinessSurfaceDescriptor(origin, v2Enabled));
    c.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    return c.html(readinessPresentationPage(origin, v2Enabled));
  });

  app.get('/readiness.json', (c) => {
    c.header('cache-control', 'public, max-age=60');
    return c.json(readinessSurfaceDescriptor(new URL(c.req.url).origin, readinessV2ActivationState().enabled));
  });

  app.get('/openapi.json', (c) => {
    c.header('cache-control', 'public, max-age=300');
    return c.json(readinessOpenApi(new URL(c.req.url).origin));
  });

  app.post('/readiness/audit', async (c) => {
    const bounded = await boundedRequest(c.req.raw, 2048);
    if ('response' in bounded) return bounded.response;
    const body = await readJsonBody<{ site?: unknown }>(bounded.request, 2048);
    if (typeof body.site !== 'string') return c.json({ error: { code: 'INVALID_SITE', detail: 'Provide a site hostname or HTTPS origin.' } }, 400);
    try {
      return c.json(await auditPublicRoot(body.site));
    } catch (err) {
      return c.json({ error: { code: 'AUDIT_UNAVAILABLE', detail: safeAuditDetail(err, 'The site could not be safely reached for this bounded quick audit.') } }, 422);
    }
  });

  app.post('/readiness/audit/v2', async (c) => {
    const bounded = await boundedRequest(c.req.raw, 2048);
    if ('response' in bounded) return bounded.response;
    const body = await readJsonBody<{ site?: unknown }>(bounded.request, 2048);
    if (typeof body.site !== 'string') return c.json({ error: { code: 'INVALID_SITE', detail: 'Provide a site hostname or HTTPS origin.' } }, 400);
    try {
      return c.json(await runActivatedReadinessV2(body.site));
    } catch (err) {
      if (err instanceof ReadinessV2ActivationError) {
        if (err.code === 'READINESS_V2_DISABLED') return c.json({ error: { code: err.code, detail: err.message } }, 503);
        return c.json({ error: { code: err.code, detail: err.message } }, 429);
      }
      return c.json({ error: { code: 'AUDIT_V2_UNAVAILABLE', detail: safeAuditDetail(err, 'The site could not be safely reached for this bounded extended audit.') } }, 422);
    }
  });

  app.get('/healthz', (c) => {
    const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
    const activation = readinessV2ActivationState();
    if (deploymentSha) c.header('x-seenrelay-deployment-sha', deploymentSha);
    return c.json({
      ok: true,
      service: 'seenrelay-readiness',
      version: SERVICE_RELEASE,
      deployment_role: 'readiness',
      environment: process.env.VERCEL_ENV || 'local',
      deployment_sha: deploymentSha,
      v2_enabled: activation.enabled
    });
  });

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', detail: 'No such readiness endpoint.' } }, 404));
  return app;
}

const readinessServiceApp = createReadinessServiceApp();
export default readinessServiceApp;
