import { Hono } from 'hono';
import process from 'node:process';
import { assertBillingDisabled } from './billing.js';
import { canonicalFact, ValidationError } from './canonical.js';
import { config } from './config.js';
import { admitHive, finishHiveCheck, finishHiveObserve } from './hive.js';
import { boundedRequest, readJsonBody, requestId } from './http.js';
import { handleMcp } from './mcp.js';
import { openApi } from './openapi.js';
import { deriveClientKey } from './identity.js';
import { checkFact, observeFact } from './service.js';
import { adminControl, adminHousekeeping, adminLogin, adminLogout, adminOperationsExport, adminPage, adminPlaybook, adminSnapshot } from './admin.js';
import { serviceDescriptor } from './public.js';
import { publicLandingPage } from './landing.js';
import { quickstartPage } from './quickstart.js';
import { economicsPage } from './economics.js';
import { trustDescriptor, trustPage } from './trust.js';
import { clientsPage, llmsText, robotsText, sitemapXml } from './adoption.js';
import { getPublicStats } from './public-db.js';
import { assertRuntimeFactAllowed } from './runtime-guard.js';
import { dataPracticesDescriptor, dataPracticesPage } from './data-practices.js';
import { productFactsForOrigin } from './public-facts-view.js';
import type { CheckRequest, ObserveRequest } from './types.js';
import { maintenanceCron } from './maintenance.js';
import { agentSkillMarkdown, agentSkillIndex } from '../shared/agent-skill.mjs';

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
  assertBillingDisabled();
  await next();
});

app.onError((err, c) => {
  if (err instanceof ValidationError) {
    return c.json({ error: { code: 'INVALID_REQUEST', detail: err.message } }, 400);
  }
  const rid = c.res.headers.get('x-request-id') || c.req.header('x-vercel-id') || 'unknown';
  console.error(JSON.stringify({ event: 'error', request_id: rid, path: c.req.path, error: err instanceof Error ? err.message : 'unknown' }));
  return c.json({ error: { code: 'INTERNAL_ERROR', detail: 'Request could not be completed.' } }, 500);
});

app.get('/', (c) => {
  const origin = new URL(c.req.url).origin;
  const accept = c.req.header('accept') || '';
  c.header('vary', 'Accept');
  if (accept.includes('text/html')) {
    c.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    c.header('cache-control', 'public, max-age=60');
    return c.html(publicLandingPage(origin));
  }
  return c.json(serviceDescriptor(origin));
});

app.get('/service.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(serviceDescriptor(new URL(c.req.url).origin));
});
app.get('/product-facts.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(productFactsForOrigin(new URL(c.req.url).origin));
});
app.get('/quickstart', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(quickstartPage(new URL(c.req.url).origin));
});
app.get('/trust', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(trustPage(new URL(c.req.url).origin));
});
app.get('/trust.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(trustDescriptor(new URL(c.req.url).origin));
});
app.get('/economics', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(economicsPage(new URL(c.req.url).origin));
});
app.get('/clients', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(clientsPage(new URL(c.req.url).origin));
});
app.get('/robots.txt', (c) => {
  c.header('content-type', 'text/plain; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(robotsText(new URL(c.req.url).origin));
});
app.get('/sitemap.xml', (c) => {
  c.header('content-type', 'application/xml; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(sitemapXml(new URL(c.req.url).origin));
});
app.get('/llms.txt', (c) => {
  c.header('content-type', 'text/plain; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(llmsText(new URL(c.req.url).origin));
});
app.get('/.well-known/agent-skills/index.json', async (c) => { c.header('cache-control','public, max-age=300'); c.header('access-control-allow-origin','*'); return c.json(await agentSkillIndex(new URL(c.req.url).origin)); });
app.get('/.well-known/skills/index.json', async (c) => { c.header('cache-control','public, max-age=300'); c.header('access-control-allow-origin','*'); return c.json(await agentSkillIndex(new URL(c.req.url).origin)); });
app.get('/.well-known/agent-skills/seenrelay/SKILL.md', (c) => { c.header('content-type','text/markdown; charset=utf-8'); c.header('cache-control','public, max-age=300'); c.header('access-control-allow-origin','*'); return c.body(agentSkillMarkdown()); });
app.get('/.well-known/skills/seenrelay/SKILL.md', (c) => { c.header('content-type','text/markdown; charset=utf-8'); c.header('cache-control','public, max-age=300'); c.header('access-control-allow-origin','*'); return c.body(agentSkillMarkdown()); });
app.get('/data-practices', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(dataPracticesPage(new URL(c.req.url).origin));
});
app.get('/data-practices.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(dataPracticesDescriptor(new URL(c.req.url).origin));
});
app.get('/public-stats.json', async (c) => {
  c.header('cache-control', 'public, max-age=15, stale-while-revalidate=45');
  return c.json(await getPublicStats());
});
app.get('/healthz', (c) => {
  const deploymentSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  if (deploymentSha) c.header('x-seenrelay-deployment-sha', deploymentSha);
  return c.json({
    ok: true,
    version: config().version,
    billing_enabled: false,
    environment: process.env.VERCEL_ENV || 'local',
    deployment_sha: deploymentSha
  });
});

app.get('/api/resource', (c) => {
  if (process.env.VERCEL_ENV === 'production') return c.notFound();

  const started = performance.now();
  const cpuStarted = process.cpuUsage();
  const revision = 'preview-http-fixture-v1';
  const etag = '"6e2a8e6f2f2939c870d0402c12ff212b37c3da4995c6c682229f39af306bf3e4"';
  const setHeaders = () => {
    const duration = Math.max(0.001, performance.now() - started);
    const cpu = process.cpuUsage(cpuStarted);
    const cpuMs = Math.max(0.001, (cpu.user + cpu.system) / 1000);
    c.header('cache-control', 'no-store');
    c.header('etag', etag);
    c.header('vary', 'Accept');
    c.header('server-timing', `app;dur=${duration.toFixed(3)}, cpu;dur=${cpuMs.toFixed(3)}`);
    c.header('x-seenrelay-fixture-revision', revision);
    c.header('x-seenrelay-fixture-commit', process.env.VERCEL_GIT_COMMIT_SHA || 'unknown');
    c.header('x-seenrelay-fixture-env', process.env.VERCEL_ENV || 'unknown');
  };

  if (c.req.header('if-none-match') === etag) {
    setHeaders();
    return c.body(null, 304);
  }

  const accept = c.req.header('accept') || '*/*';
  if (accept.split(',').some((item) => item.trim().toLowerCase().startsWith('text/plain'))) {
    const body = 'version=1\n';
    setHeaders();
    return c.body(body, 200, { 'content-type': 'text/plain; charset=utf-8' });
  }

  const body = JSON.stringify({ version: 1, payload: 'x'.repeat(64 * 1024) });
  setHeaders();
  return c.body(body, 200, { 'content-type': 'application/json; charset=utf-8' });
});

app.get('/openapi.json', (c) => { c.header('cache-control', 'public, max-age=3600'); return c.json(openApi(new URL(c.req.url).origin)); });
app.all('/mcp', (c) => handleMcp(c.req.raw));

app.get('/internal/maintenance', (c) => maintenanceCron(c.req.raw));

app.get('/admin', (c) => adminPage(c.req.raw));
app.post('/admin/login', async (c) => {
  const bounded = await boundedRequest(c.req.raw, Math.min(config().maxBodyBytes, 4096));
  if ('response' in bounded) return bounded.response;
  return adminLogin(bounded.request);
});
app.post('/admin/logout', async (c) => {
  const bounded = await boundedRequest(c.req.raw, Math.min(config().maxBodyBytes, 4096));
  if ('response' in bounded) return bounded.response;
  return adminLogout(bounded.request);
});
app.get('/admin/api/snapshot', (c) => adminSnapshot(c.req.raw));
app.get('/admin/api/operations-export', (c) => adminOperationsExport(c.req.raw));
app.post('/admin/api/control', async (c) => {
  const bounded = await boundedRequest(c.req.raw, Math.min(config().maxBodyBytes, 4096));
  if ('response' in bounded) return bounded.response;
  return adminControl(bounded.request);
});
app.post('/admin/api/playbook', async (c) => {
  const bounded = await boundedRequest(c.req.raw, Math.min(config().maxBodyBytes, 4096));
  if ('response' in bounded) return bounded.response;
  return adminPlaybook(bounded.request);
});
app.post('/admin/api/housekeeping', async (c) => {
  const bounded = await boundedRequest(c.req.raw, Math.min(config().maxBodyBytes, 4096));
  if ('response' in bounded) return bounded.response;
  return adminHousekeeping(bounded.request);
});

app.post('/v1/check', async (c) => {
  const started = Date.now();
  const bounded = await boundedRequest(c.req.raw, config().maxBodyBytes);
  if ('response' in bounded) return bounded.response;
  const request = bounded.request;
  const body = await readJsonBody<CheckRequest>(request, config().maxBodyBytes);
  canonicalFact(body.fact);
  assertRuntimeFactAllowed(body.fact);
  const admission = await admitHive(request, 'check');
  if (!admission.allowed) {
    if (admission.reason === 'runtime_disabled') return c.json({ error: { code: 'SERVICE_CONTROLLED', detail: 'CHECK is temporarily disabled by the SeenRelay control plane.' }, hive: admission.state }, 503);
    if (admission.state.retry_after_seconds) c.header('retry-after', String(admission.state.retry_after_seconds));
    if (admission.reason === 'admission_limited') {
      return c.json({ error: { code: 'HIVE_ADMISSION_LIMITED', detail: 'Hive operations from this network are temporarily limited. Retry shortly.' }, hive: admission.state }, 429);
    }
    c.header('x-seenrelay-lease', admission.token);
    return c.json({ error: { code: 'HIVE_RATE_LIMITED', detail: 'Free CHECK allowance is refilling.' }, hive: admission.state }, 429);
  }
  c.header('x-seenrelay-lease', admission.token);
  const result = await checkFact(body);
  const finished = await finishHiveCheck(admission, result);
  const clientKey = await deriveClientKey(request);
  console.log(JSON.stringify({ event: 'check', client_key: clientKey, hive_class: finished.state.class, outcome: result.status, useful_reuse_awards: finished.usefulReuseAwards, latency_ms: Date.now() - started }));
  return c.json({ ...result, hive: finished.state, useful_reuse_awards: finished.usefulReuseAwards });
});

app.post('/v1/observe', async (c) => {
  const started = Date.now();
  const bounded = await boundedRequest(c.req.raw, config().maxBodyBytes);
  if ('response' in bounded) return bounded.response;
  const request = bounded.request;
  const body = await readJsonBody<ObserveRequest>(request, config().maxBodyBytes);
  canonicalFact(body.fact);
  assertRuntimeFactAllowed(body.fact);
  const admission = await admitHive(request, 'observe');
  if (!admission.allowed) {
    if (admission.reason === 'runtime_disabled') return c.json({ error: { code: 'SERVICE_CONTROLLED', detail: 'OBSERVE is temporarily disabled by the SeenRelay control plane.' }, hive: admission.state }, 503);
    if (admission.state.retry_after_seconds) c.header('retry-after', String(admission.state.retry_after_seconds));
    return c.json({ error: { code: 'HIVE_ADMISSION_LIMITED', detail: 'Hive operations from this network are temporarily limited. Retry shortly.' }, hive: admission.state }, 429);
  }
  c.header('x-seenrelay-lease', admission.token);
  const result = await observeFact(request, body, admission.leaseId);
  const hive = await finishHiveObserve(admission, result.fact_key, result.accepted ? 'accepted' : 'deduplicated');
  const clientKey = await deriveClientKey(request);
  console.log(JSON.stringify({ event: 'observe', client_key: clientKey, hive_class: hive.class, observer_identity: result.observer_identity, observer_assurance: result.observer_assurance, outcome: result.accepted ? 'accepted' : 'deduplicated', latency_ms: Date.now() - started }));
  return c.json({ ...result, hive });
});

app.all('/v1/billing/*', (c) => c.json({ error: { code: 'BILLING_DISABLED', detail: 'Billing is not available in this deployment.' } }, 404));
app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', detail: 'No such endpoint.' } }, 404));

export default app;
