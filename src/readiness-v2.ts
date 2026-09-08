import { consumeHiveNetworkBudget } from './hive-admission-db.js';
import { privacyScopedHash } from './identity.js';
import { boundedPinnedGet, normalizeAuditTarget, resolvePinnedPublicAddress, type BoundedGetResult } from './readiness-network.js';

const READINESS_V2_GLOBAL_AUDITS_PER_MINUTE = 3;
const READINESS_V2_TARGET_AUDITS_PER_MINUTE = 1;
const READINESS_V2_TIMEOUT_MS = 1_500;
const READINESS_V2_USER_AGENT = 'SeenRelayAIReadiness/2.0 (+https://seenrelay.com/readiness)';

const PROBES = Object.freeze([
  { id: 'root', path: '/', maxBytes: 131_072, role: 'REQUIRED_ROOT' },
  { id: 'robots', path: '/robots.txt', maxBytes: 65_536, role: 'OPTIONAL_CRAWL_HINT' },
  { id: 'sitemap', path: '/sitemap.xml', maxBytes: 131_072, role: 'OPTIONAL_CRAWL_HINT' },
  { id: 'llmsTxt', path: '/llms.txt', maxBytes: 65_536, role: 'OPTIONAL_AGENT_HINT' },
  { id: 'a2aAgentCard', path: '/.well-known/agent-card.json', maxBytes: 131_072, role: 'STANDARD_A2A_DISCOVERY' },
  { id: 'openapi', path: '/openapi.json', maxBytes: 262_144, role: 'OPTIONAL_COMMON_OPENAPI_PATH' }
] as const);

const TOTAL_MAX_BYTES = PROBES.reduce((sum, probe) => sum + probe.maxBytes, 0);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);

type ProbeId = typeof PROBES[number]['id'];
type DimensionStatus = 'PASS' | 'FIX' | 'INFO' | 'NOT_APPLICABLE';
export type ReadinessV2ProbeResult = {
  id: ProbeId;
  url?: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
  elapsedMs?: number;
  error?: 'PROBE_FAILED';
};

export type ReadinessV2Report = {
  protocol: 'seenrelay-ai-site-readiness-v2';
  scope: 'bounded_machine_surface_classification';
  targetOrigin: string;
  verdict: 'MACHINE_READY' | 'PARTIAL_MACHINE_READY' | 'NATIVE_FIX_RECOMMENDED' | 'INCONCLUSIVE';
  verifiedMachineSurfaces: Array<'OPENAPI' | 'A2A'>;
  dimensions: Record<string, { status: DimensionStatus; evidence: boolean; detail: string }>;
  nextSteps: string[];
  limitations: string[];
  seenrelayCandidate: false;
  seenrelayRecommendation: 'REQUIRES_OWNER_WORKLOAD_EVIDENCE';
};

export type ReadinessV2ProbeEvidence = {
  root: { success: boolean; machineLinkPresent: boolean; positiveFreshness: boolean; etagPresent: boolean; lastModifiedPresent: boolean };
  robots: { present: boolean };
  sitemap: { present: boolean };
  llmsTxt: { present: boolean };
  openapi: { valid: boolean; operationCount: number; linkedFromRoot: boolean };
  a2aAgentCard: { valid: boolean; interfaceCount: number };
  mcp: { advertised: boolean };
  agentSkills: { advertised: boolean };
  agentPayment: { advertised: boolean };
};

export type ReadinessV2Evidence = {
  protocol: 'seenrelay-site-audit-interpreted-evidence-v2';
  origin: string;
  probes: ReadinessV2ProbeEvidence;
  report: ReadinessV2Report;
};

export type ReadinessV2Audit = {
  protocol: 'seenrelay-site-audit-execution-v2';
  requestCount: 6;
  retries: 0;
  totalMaxBytes: 786432;
  evidence: ReadinessV2Evidence;
};

function headerValue(headers: ReadinessV2ProbeResult['headers'], name: string): string {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : '';
}

function success(status: number): boolean { return status >= 200 && status < 300; }
function parseJson(body: Buffer): unknown { try { return JSON.parse(body.toString('utf8')); } catch { return null; } }
function positiveFreshness(cacheControl: string): boolean {
  if (/\bno-store\b/i.test(cacheControl)) return false;
  const match = cacheControl.match(/(?:^|,)\s*(?:s-maxage|max-age)\s*=\s*"?(\d+)/i);
  return Boolean(match && Number(match[1]) > 0);
}
function validHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function countOpenApiOperations(doc: unknown): number {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return 0;
  const value = doc as Record<string, unknown>;
  if (!/^3(?:\.|$)/.test(String(value.openapi || '')) || !value.paths || typeof value.paths !== 'object' || Array.isArray(value.paths)) return 0;
  let count = 0;
  for (const item of Object.values(value.paths as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const key of Object.keys(item as Record<string, unknown>)) if (HTTP_METHODS.has(key.toLowerCase())) count += 1;
  }
  return count;
}
function validA2aCard(doc: unknown): doc is Record<string, unknown> & { supportedInterfaces: unknown[] } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const value = doc as Record<string, unknown>;
  for (const key of ['name', 'description', 'version']) if (typeof value[key] !== 'string' || !value[key]) return false;
  if (!Array.isArray(value.supportedInterfaces) || value.supportedInterfaces.length === 0) return false;
  if (!value.supportedInterfaces.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    return validHttpsUrl(item.url) && typeof item.protocolBinding === 'string' && Boolean(item.protocolBinding) && typeof item.protocolVersion === 'string' && Boolean(item.protocolVersion);
  })) return false;
  if (!value.capabilities || typeof value.capabilities !== 'object' || Array.isArray(value.capabilities)) return false;
  if (!Array.isArray(value.defaultInputModes) || !Array.isArray(value.defaultOutputModes) || !Array.isArray(value.skills)) return false;
  return value.skills.every((skill) => {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return false;
    const item = skill as Record<string, unknown>;
    return typeof item.id === 'string' && Boolean(item.id)
      && typeof item.name === 'string' && Boolean(item.name)
      && typeof item.description === 'string' && Boolean(item.description)
      && Array.isArray(item.tags);
  });
}
function machineLink(link: string): boolean { return /openapi|agent-card|\/mcp(?:[>;\s]|$)|agent-skills|application\/(?:json|a2a\+json)/i.test(link); }
function dimension(status: DimensionStatus, evidence: boolean, detail: string) { return { status, evidence, detail }; }

function interpretProbeResults(results: Partial<Record<ProbeId, ReadinessV2ProbeResult>>): ReadinessV2ProbeEvidence {
  const root = results.root;
  const rootHeaders = root?.headers || {};
  const rootLink = headerValue(rootHeaders, 'link');
  const openApiDocument = results.openapi && success(results.openapi.status) && !results.openapi.truncated ? parseJson(results.openapi.body) : null;
  const openApiOperations = countOpenApiOperations(openApiDocument);
  const a2aDocument = results.a2aAgentCard && success(results.a2aAgentCard.status) && !results.a2aAgentCard.truncated ? parseJson(results.a2aAgentCard.body) : null;
  const a2aValid = validA2aCard(a2aDocument);
  return {
    root: {
      success: Boolean(root && success(root.status)),
      machineLinkPresent: machineLink(rootLink),
      positiveFreshness: positiveFreshness(headerValue(rootHeaders, 'cache-control')),
      etagPresent: Boolean(headerValue(rootHeaders, 'etag')),
      lastModifiedPresent: Boolean(headerValue(rootHeaders, 'last-modified'))
    },
    robots: { present: Boolean(results.robots && success(results.robots.status)) },
    sitemap: { present: Boolean(results.sitemap && success(results.sitemap.status)) },
    llmsTxt: { present: Boolean(results.llmsTxt && success(results.llmsTxt.status)) },
    openapi: { valid: openApiOperations > 0, operationCount: openApiOperations, linkedFromRoot: /openapi/i.test(rootLink) },
    a2aAgentCard: { valid: a2aValid, interfaceCount: a2aValid ? a2aDocument.supportedInterfaces.length : 0 },
    mcp: { advertised: /\/mcp(?:[>;\s]|$)|modelcontextprotocol/i.test(rootLink) },
    agentSkills: { advertised: /agent-skills|SKILL\.md/i.test(rootLink) },
    agentPayment: { advertised: /\bx402\b|payment-required/i.test(rootLink) }
  };
}

export function classifyReadinessV2FromEvidence(origin: string, probes: ReadinessV2ProbeEvidence): ReadinessV2Report {
  const rootOk = probes.root.success;
  const openApiValid = probes.openapi.valid && probes.openapi.operationCount > 0;
  const a2aValid = probes.a2aAgentCard.valid && probes.a2aAgentCard.interfaceCount > 0;
  const verifiedMachineContract = openApiValid || a2aValid;
  const explicitDiscovery = probes.root.machineLinkPresent || a2aValid || probes.openapi.linkedFromRoot;
  const nativeFreshness = probes.root.positiveFreshness;
  const nativeValidator = probes.root.etagPresent || probes.root.lastModifiedPresent;
  const crawlHints = probes.robots.present || probes.sitemap.present;
  const llmsHint = probes.llmsTxt.present;
  const advertisedMcp = probes.mcp.advertised;
  const skillHint = probes.agentSkills.advertised;
  const paymentHint = probes.agentPayment.advertised;

  let verdict: ReadinessV2Report['verdict'];
  if (!rootOk) verdict = 'INCONCLUSIVE';
  else if (verifiedMachineContract && explicitDiscovery) verdict = 'MACHINE_READY';
  else if (verifiedMachineContract || explicitDiscovery || advertisedMcp || skillHint || crawlHints || llmsHint) verdict = 'PARTIAL_MACHINE_READY';
  else verdict = 'NATIVE_FIX_RECOMMENDED';

  const dimensions = {
    publicHttpsRepresentation: dimension(rootOk ? 'PASS' : 'INFO', rootOk, rootOk ? 'A public root representation was observed.' : 'No successful public root representation was established.'),
    machineDiscovery: dimension(explicitDiscovery ? 'PASS' : (rootOk ? 'FIX' : 'INFO'), explicitDiscovery, explicitDiscovery ? 'At least one machine surface is explicitly discoverable.' : 'No verified explicit machine-discovery path was established.'),
    machineContract: dimension(verifiedMachineContract ? 'PASS' : (rootOk ? 'FIX' : 'INFO'), verifiedMachineContract, verifiedMachineContract ? 'At least one structured machine contract was verified.' : 'No valid OpenAPI or A2A contract was established by the bounded probes.'),
    a2aDelegation: dimension(a2aValid ? 'PASS' : 'INFO', a2aValid, a2aValid ? `A valid A2A Agent Card with ${probes.a2aAgentCard.interfaceCount} interface(s) was observed.` : 'A2A is optional; no valid A2A Agent Card was established.'),
    mcpDiscovery: dimension(advertisedMcp ? 'INFO' : 'NOT_APPLICABLE', advertisedMcp, advertisedMcp ? 'An MCP surface was advertised; capability correctness requires protocol introspection.' : 'MCP is optional and absence is not a readiness failure.'),
    nativeFreshness: dimension(nativeFreshness ? 'PASS' : (nativeValidator ? 'INFO' : 'FIX'), nativeFreshness || nativeValidator, nativeFreshness ? 'The root advertises a positive native freshness window.' : nativeValidator ? 'A native conditional validator is present; effective 304 behavior still requires testing.' : 'No positive freshness window or conditional validator was established on the root response.'),
    crawlHints: dimension(crawlHints ? 'PASS' : 'INFO', crawlHints, crawlHints ? 'robots.txt and/or sitemap discovery was observed.' : 'Crawl/index hints are optional and were not established.'),
    agentInstructions: dimension(llmsHint || skillHint ? 'INFO' : 'NOT_APPLICABLE', llmsHint || skillHint, llmsHint || skillHint ? 'Agent-oriented instructions or skills were observed or advertised.' : 'Agent instruction files are optional and not treated as a universal requirement.'),
    agentPayment: dimension(paymentHint ? 'INFO' : 'NOT_APPLICABLE', paymentHint, paymentHint ? 'An agent-payment surface was advertised; payment safety and economics require separate verification.' : 'Agent payment is workload-dependent and absence is not a readiness failure.')
  };

  const nextSteps: string[] = [];
  if (rootOk && !verifiedMachineContract) nextSteps.push('Expose at least one structured machine contract for relevant functionality, such as OpenAPI or A2A, rather than relying on HTML-only interaction.');
  if (rootOk && verifiedMachineContract && !explicitDiscovery) nextSteps.push('Make the machine contract discoverable from a standard or explicit machine-discovery surface.');
  if (rootOk && !nativeFreshness && !nativeValidator) nextSteps.push('Prefer source-native HTTP freshness or conditional validators where the representation semantics permit them.');
  if (nativeValidator && !nativeFreshness) nextSteps.push('Test conditional revalidation before adding another reuse layer; validator presence alone does not prove an effective 304 path.');
  if (advertisedMcp) nextSteps.push('Introspect the advertised MCP endpoint and verify tools, schemas, side-effect semantics and protocol compatibility before treating it as operational.');
  nextSteps.push('Use owner-side workload evidence to test whether agents actually repeat expensive validation before considering shared validation reuse.');

  return {
    protocol: 'seenrelay-ai-site-readiness-v2',
    scope: 'bounded_machine_surface_classification',
    targetOrigin: origin,
    verdict,
    verifiedMachineSurfaces: [...(openApiValid ? ['OPENAPI' as const] : []), ...(a2aValid ? ['A2A' as const] : [])],
    dimensions,
    nextSteps,
    limitations: [
      'This audit evaluates bounded public surface evidence, not authenticated workflows or complete site behavior.',
      'It does not prove that an advertised API, MCP server, A2A skill, payment surface or validator behaves correctly under real workload.',
      'It does not crawl the site or infer hidden capabilities from prose.',
      'It cannot establish repeated validation, reuse safety, savings or SeenRelay workload fit from surface evidence alone.'
    ],
    seenrelayCandidate: false,
    seenrelayRecommendation: 'REQUIRES_OWNER_WORKLOAD_EVIDENCE'
  };
}

export function classifyReadinessV2(origin: string, results: Partial<Record<ProbeId, ReadinessV2ProbeResult>>): ReadinessV2Report {
  return classifyReadinessV2FromEvidence(origin, interpretProbeResults(results));
}

export function interpretReadinessV2(origin: string, results: Partial<Record<ProbeId, ReadinessV2ProbeResult>>): ReadinessV2Evidence {
  const probes = interpretProbeResults(results);
  return { protocol: 'seenrelay-site-audit-interpreted-evidence-v2', origin, probes, report: classifyReadinessV2FromEvidence(origin, probes) };
}

async function admitReadinessV2(hostname: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const globalKey = `readiness-v2-global:${await privacyScopedHash('readiness-v2-admission-global', 'v2')}`;
  const globalBudget = await consumeHiveNetworkBudget(globalKey, nowIso, READINESS_V2_GLOBAL_AUDITS_PER_MINUTE);
  if (!globalBudget.allowed) throw new Error('Only a limited number of extended readiness audits can start each minute; retry shortly.');
  const targetKey = `readiness-v2-target:${await privacyScopedHash('readiness-v2-admission-target', hostname)}`;
  const targetBudget = await consumeHiveNetworkBudget(targetKey, nowIso, READINESS_V2_TARGET_AUDITS_PER_MINUTE);
  if (!targetBudget.allowed) throw new Error('Only one extended readiness audit can target the same hostname each minute; retry shortly.');
}

function fromRaw(id: ProbeId, url: string, raw: BoundedGetResult): ReadinessV2ProbeResult { return { id, url, ...raw }; }

export function readinessV2ProbePlan(input: string) {
  const target = normalizeAuditTarget(input);
  return {
    protocol: 'seenrelay-site-audit-probe-plan-v2' as const,
    origin: target.origin,
    redirectPolicy: 'NO_REDIRECT_FOLLOWING' as const,
    requestPolicy: 'GET_ONLY_NO_AUTH_NO_COOKIES' as const,
    probeCount: 6 as const,
    totalMaxBytes: 786432 as const,
    probes: PROBES.map((probe) => ({ ...probe, url: `${target.origin}${probe.path}` })),
    invariants: { httpsOnly: true, sameOriginOnly: true, userSuppliedPaths: false, authentication: false, crawl: false, mutation: false, retries: 0 as const }
  };
}

export async function auditPublicAiReadinessV2(input: string): Promise<ReadinessV2Audit> {
  const target = normalizeAuditTarget(input);
  await admitReadinessV2(target.hostname);
  const pinned = await resolvePinnedPublicAddress(target.hostname);
  const results: Partial<Record<ProbeId, ReadinessV2ProbeResult>> = {};

  for (const probe of PROBES) {
    const url = `${target.origin}${probe.path}`;
    try {
      const raw = await boundedPinnedGet(target, pinned, {
        path: probe.path,
        maxBytes: probe.maxBytes,
        timeoutMs: READINESS_V2_TIMEOUT_MS,
        userAgent: READINESS_V2_USER_AGENT,
        accept: 'application/json,text/plain,text/html,application/xml;q=0.8,*/*;q=0.2'
      });
      results[probe.id] = fromRaw(probe.id, url, raw);
    } catch {
      results[probe.id] = { id: probe.id, url, status: 0, headers: {}, body: Buffer.alloc(0), truncated: false, elapsedMs: 0, error: 'PROBE_FAILED' };
    }
  }

  return {
    protocol: 'seenrelay-site-audit-execution-v2',
    requestCount: 6,
    retries: 0,
    totalMaxBytes: 786432,
    evidence: interpretReadinessV2(target.origin, results)
  };
}
