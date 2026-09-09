import { Hono } from 'hono';
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
import { fleetPage } from './fleet.js';
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
import { auditPublicRoot } from './readiness.js';
import { readinessPresentationPage, readinessSurfaceDescriptor } from './readiness-presentation.js';
import { ReadinessV2ActivationError, readinessV2ActivationState, runActivatedReadinessV2 } from './readiness-v2-activation.js';
import readinessServiceApp from './readiness-service.js';
import { readinessAuditOrigin, readinessConnectSrc, readinessRemoteEndpoint, readinessV2EnabledForPresentation } from './readiness-routing.js';

const app = new Hono();

function publicDiscoveryLinks(origin: string): string {
  return [
    `<${origin}/service.json>; rel="service-desc"; type="application/json"`,
    `<${origin}/openapi.json>; rel="service-desc"; type="application/json"`,
    `<${origin}/product-facts.json>; rel="service-meta"; type="application/json"`,
    `<${origin}/quickstart>; rel="service-doc"; type="text/html"`
  ].join(', ');
}

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
  c.header('link', publicDiscoveryLinks(origin));
  c.header('content-language', 'en');
  if (accept.includes('text/html')) {
    c.header('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    c.header('cache-control', 'public, max-age=60');
    return c.html(publicLandingPage(origin));
  }
  return c.json(serviceDescriptor(origin));
});

app.get('/service.json', (c) => {
  const origin = new URL(c.req.url).origin;
  c.header('cache-control', 'public, max-age=300');
  c.header('link', publicDiscoveryLinks(origin));
  c.header('content-language', 'en');
  return c.json(serviceDescriptor(origin));
});
app.get('/product-facts.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(productFactsForOrigin(new URL(c.req.url).origin));
});
app.get('/quickstart', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(quickstartPage(new URL(c.req.url).origin));
});
app.get('/fleet', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(fleetPage(new URL(c.req.url).origin));
});
app.get('/trust', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(trustPage(new URL(c.req.url).origin));
});
app.get('/trust.json', (c) => {
  c.header('cache-control', 'public, max-age=300');
  return c.json(trustDescriptor(new URL(c.req.url).origin));
});
app.get('/economics', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(economicsPage(new URL(c.req.url).origin));
});
app.get('/clients', (c) => {
  c.header('content-security-policy', "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('cache-control', 'public, max-age=300');
  return c.html(clientsPage(new URL(c.req.url).origin));
});
app.get('/readiness', (c) => {
  const origin = new URL(c.req.url).origin;
  const auditOrigin = readinessAuditOrigin(origin);
  const v2Enabled = readinessV2EnabledForPresentation(readinessV2ActivationState().enabled, origin);
  const accept = c.req.header('accept') || '';
  c.header('vary', 'Accept');
  c.header('cache-control', 'public, max-age=60');
  if (!accept.includes('text/html')) return c.json(readinessSurfaceDescriptor(origin, v2Enabled, auditOrigin));
  c.header('content-security-policy', `default-src 'self'; script-src 'self'; style-src 'self'; connect-src ${readinessConnectSrc(origin)}; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`);
  return c.html(readinessPresentationPage(origin, v2Enabled, auditOrigin));
});
app.get('/readiness.json', (c) => {
  const origin = new URL(c.req.url).origin;
  const auditOrigin = readinessAuditOrigin(origin);
  const v2Enabled = readinessV2EnabledForPresentation(readinessV2ActivationState().enabled, origin);
  c.header('cache-control', 'public, max-age=60');
  return c.json(readinessSurfaceDescriptor(origin, v2Enabled, auditOrigin));
});
app.post('/readiness/audit', async (c) => {
  const origin = new URL(c.req.url).origin;
  const remote = readinessRemoteEndpoint(origin, '/readiness/audit');
  if (remote) return c.redirect(remote, 307);
  const bounded = await boundedRequest(c.req.raw, 2048);
  if ('response' in bounded) return bounded.response;
  const body = await readJsonBody<{ site?: unknown }>(bounded.request, 2048);
  if (typeof body.site !== 'string') return c.json({ error: { code: 'INVALID_SITE', detail: 'Provide a site hostname or HTTPS origin.' } }, 400);
  try {
    return c.json(await auditPublicRoot(body.site));
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    const safeDetail = /^(Enter|Only|Credentials|Local|The hostname|DNS returned|No supported)/.test(message)
      ? message
      : 'The site could not be safely reached for this bounded quick audit.';
    return c.json({ error: { code: 'AUDIT_UNAVAILABLE', detail: safeDetail } }, 422);
  }
});
app.post('/readiness/audit/v2', async (c) => {
  const origin = new URL(c.req.url).origin;
  const remote = readinessRemoteEndpoint(origin, '/readiness/audit/v2');
  if (remote) return c.redirect(remote, 307);
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
    const message = err instanceof Error ? err.message : '';
    const safeDetail = /^(Enter|Only|Credentials|Local|The hostname|DNS returned|No supported)/.test(message)
      ? message
      : 'The site could not be safely reached for this bounded extended audit.';
    return c.json({ error: { code: 'AUDIT_V2_UNAVAILABLE', detail: safeDetail } }, 422);
  }
});
app.get('/favicon.ico', (c) => c.redirect('/seenrelay-logo.svg', 308));
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

export default process.env.SEENRELAY_DEPLOYMENT_ROLE === 'readiness' ? readinessServiceApp : app;
