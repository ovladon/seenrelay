import { lookup } from 'node:dns/promises';
import https from 'node:https';
import { consumeHiveNetworkBudget } from './hive-admission-db.js';
import { privacyScopedHash } from './identity.js';
import { isGlobalPublicIp, normalizeAuditTarget } from './readiness.js';

const READINESS_V2_GLOBAL_AUDITS_PER_MINUTE = 3;
const READINESS_V2_TARGET_AUDITS_PER_MINUTE = 1;
const PROBE_TIMEOUT_MS = 3_000;
const USER_AGENT = 'SeenRelayAIReadiness/2.0 (+https://seenrelay.com/readiness)';

const PROBES = Object.freeze([
  { id: 'root', path: '/', maxBytes: 131_072 },
  { id: 'robots', path: '/robots.txt', maxBytes: 65_536 },
  { id: 'sitemap', path: '/sitemap.xml', maxBytes: 131_072 },
  { id: 'llmsTxt', path: '/llms.txt', maxBytes: 65_536 },
  { id: 'a2aAgentCard', path: '/.well-known/agent-card.json', maxBytes: 131_072 },
  { id: 'openapi', path: '/openapi.json', maxBytes: 262_144 }
] as const);

type ProbeId = typeof PROBES[number]['id'];
type PinnedAddress = { address: string; family: 4 | 6 };
type ProbeResult = {
  id: ProbeId;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
};

type DimensionStatus = 'PASS' | 'FIX' | 'INFO' | 'NOT_APPLICABLE';
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

async function admitReadinessV2(hostname: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const globalKey = `readiness-v2-global:${await privacyScopedHash('readiness-v2-admission-global', 'v1')}`;
  const globalBudget = await consumeHiveNetworkBudget(globalKey, nowIso, READINESS_V2_GLOBAL_AUDITS_PER_MINUTE);
  if (!globalBudget.allowed) throw new Error('Only a limited number of extended readiness audits can start each minute; retry shortly.');
  const targetKey = `readiness-v2-target:${await privacyScopedHash('readiness-v2-admission-target', hostname)}`;
  const targetBudget = await consumeHiveNetworkBudget(targetKey, nowIso, READINESS_V2_TARGET_AUDITS_PER_MINUTE);
  if (!targetBudget.allowed) throw new Error('Only one extended readiness audit can target the same hostname each minute; retry shortly.');
}

async function resolvePinnedPublicAddress(hostname: string): Promise<PinnedAddress> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  if (!answers.length) throw new Error('DNS returned no addresses for this hostname.');
  for (const answer of answers) {
    if (!isGlobalPublicIp(answer.address)) throw new Error('The hostname resolves to a non-public or special-purpose address.');
  }
  const preferred = answers.find((answer) => answer.family === 4) || answers.find((answer) => answer.family === 6);
  if (!preferred || (preferred.family !== 4 && preferred.family !== 6)) throw new Error('No supported public address was returned.');
  return { address: preferred.address, family: preferred.family };
}

function probeRequest(url: URL, pinned: PinnedAddress, probe: typeof PROBES[number]): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let settled = false;
    const finish = (status: number, headers: ProbeResult['headers']) => {
      if (settled) return;
      settled = true;
      resolve({ id: probe.id, status, headers, body: Buffer.concat(chunks), truncated });
    };
    const req = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: 443,
      family: pinned.family,
      path: probe.path,
      method: 'GET',
      servername: url.hostname,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json,text/plain,text/html,application/xml;q=0.8,*/*;q=0.2',
        'accept-encoding': 'identity',
        connection: 'close'
      },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family)
    }, (response) => {
      response.on('data', (chunk: Buffer | string) => {
        if (truncated) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const remaining = probe.maxBytes - size;
        if (buffer.length > remaining) {
          if (remaining > 0) chunks.push(buffer.subarray(0, remaining));
          size = probe.maxBytes;
          truncated = true;
          response.destroy();
          return;
        }
        chunks.push(buffer);
        size += buffer.length;
      });
      response.on('end', () => finish(response.statusCode || 0, response.headers));
      response.on('close', () => {
        if (truncated) finish(response.statusCode || 0, response.headers);
      });
    });
    req.setTimeout(PROBE_TIMEOUT_MS, () => req.destroy(new Error('The site did not respond within the extended audit timeout.')));
    req.on('error', reject);
    req.end();
  });
}

function headerValue(headers: ProbeResult['headers'], name: string): string | null {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(', ');
  return typeof value === 'string' ? value : null;
}

function success(status: number): boolean { return status >= 200 && status < 300; }
function parseJson(body: Buffer): unknown { try { return JSON.parse(body.toString('utf8')); } catch { return null; } }
function positiveFreshness(cacheControl: string | null): boolean {
  if (!cacheControl || /\bno-store\b/i.test(cacheControl)) return false;
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
  const methods = new Set(['get','post','put','patch','delete','head','options','trace']);
  let count = 0;
  for (const item of Object.values(value.paths as Record<string, unknown>)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    for (const key of Object.keys(item as Record<string, unknown>)) if (methods.has(key.toLowerCase())) count += 1;
  }
  return count;
}
function validA2aCard(doc: unknown): boolean {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const value = doc as Record<string, unknown>;
  for (const key of ['name','description','version']) if (typeof value[key] !== 'string' || !value[key]) return false;
  if (!Array.isArray(value.supportedInterfaces) || value.supportedInterfaces.length === 0) return false;
  if (!value.supportedInterfaces.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    const x = entry as Record<string, unknown>;
    return validHttpsUrl(x.url) && typeof x.protocolBinding === 'string' && Boolean(x.protocolBinding) && typeof x.protocolVersion === 'string' && Boolean(x.protocolVersion);
  })) return false;
  if (!value.capabilities || typeof value.capabilities !== 'object' || Array.isArray(value.capabilities)) return false;
  if (!Array.isArray(value.defaultInputModes) || !Array.isArray(value.defaultOutputModes) || !Array.isArray(value.skills)) return false;
  return value.skills.every((skill) => {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) return false;
    const x = skill as Record<string, unknown>;
    return typeof x.id === 'string' && Boolean(x.id) && typeof x.name === 'string' && Boolean(x.name) && typeof x.description === 'string' && Boolean(x.description) && Array.isArray(x.tags);
  });
}
function machineLink(link: string): boolean { return /openapi|agent-card|\/mcp(?:[>;\s]|$)|agent-skills|application\/(?:json|a2a\+json)/i.test(link); }
function dimension(status: DimensionStatus, evidence: boolean, detail: string) { return { status, evidence, detail }; }

export function classifyReadinessV2(origin: string, results: Partial<Record<ProbeId, ProbeResult>>): ReadinessV2Report {
  const root = results.root;
  const rootOk = Boolean(root && success(root.status));
  const rootCache = root ? headerValue(root.headers, 'cache-control') : null;
  const rootLink = root ? (headerValue(root.headers, 'link') || '') : '';
  const etag = Boolean(root && headerValue(root.headers, 'etag'));
  const lastModified = Boolean(root && headerValue(root.headers, 'last-modified'));
  const nativeFreshness = positiveFreshness(rootCache);

  const openapi = results.openapi && success(results.openapi.status) ? parseJson(results.openapi.body) : null;
  const openApiOperations = countOpenApiOperations(openapi);
  const openApiValid = openApiOperations > 0;
  const a2a = results.a2aAgentCard && success(results.a2aAgentCard.status) ? parseJson(results.a2aAgentCard.body) : null;
  const a2aValid = validA2aCard(a2a);
  const a2aInterfaceCount = a2aValid ? ((a2a as Record<string, unknown>).supportedInterfaces as unknown[]).length : 0;
  const explicitDiscovery = machineLink(rootLink) || a2aValid || (openApiValid && /openapi/i.test(rootLink));
  const verifiedMachineContract = openApiValid || a2aValid;
  const crawlHints = Boolean((results.robots && success(results.robots.status)) || (results.sitemap && success(results.sitemap.status)));
  const llmsHint = Boolean(results.llmsTxt && success(results.llmsTxt.status));
  const advertisedMcp = /\/mcp(?:[>;\s]|$)|modelcontextprotocol/i.test(rootLink);
  const skillHint = /agent-skills|SKILL\.md/i.test(rootLink);
  const paymentHint = /\bx402\b|payment-required/i.test(rootLink);

  let verdict: ReadinessV2Report['verdict'];
  if (!rootOk) verdict = 'INCONCLUSIVE';
  else if (verifiedMachineContract && explicitDiscovery) verdict = 'MACHINE_READY';
  else if (verifiedMachineContract || explicitDiscovery || advertisedMcp || skillHint || crawlHints || llmsHint) verdict = 'PARTIAL_MACHINE_READY';
  else verdict = 'NATIVE_FIX_RECOMMENDED';

  const nativeValidator = etag || lastModified;
  const dimensions = {
    publicHttpsRepresentation: dimension(rootOk ? 'PASS' : 'INFO', rootOk, rootOk ? 'A public root representation was observed.' : 'No successful public root representation was established.'),
    machineDiscovery: dimension(explicitDiscovery ? 'PASS' : (rootOk ? 'FIX' : 'INFO'), explicitDiscovery, explicitDiscovery ? 'At least one machine surface is explicitly discoverable.' : 'No verified explicit machine-discovery path was established.'),
    machineContract: dimension(verifiedMachineContract ? 'PASS' : (rootOk ? 'FIX' : 'INFO'), verifiedMachineContract, verifiedMachineContract ? 'At least one structured machine contract was verified.' : 'No valid OpenAPI or A2A contract was established by the bounded probes.'),
    a2aDelegation: dimension(a2aValid ? 'PASS' : 'INFO', a2aValid, a2aValid ? `A valid A2A Agent Card with ${a2aInterfaceCount} interface(s) was observed.` : 'A2A is optional; no valid A2A Agent Card was established.'),
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

export async function auditPublicAiReadinessV2(input: string): Promise<ReadinessV2Report> {
  const target = normalizeAuditTarget(input);
  await admitReadinessV2(target.hostname);
  const pinned = await resolvePinnedPublicAddress(target.hostname);
  const results: Partial<Record<ProbeId, ProbeResult>> = {};
  const rootProbe = PROBES[0];
  results.root = await probeRequest(target, pinned, rootProbe);
  if (!success(results.root.status)) return classifyReadinessV2(target.origin.slice(0, -1), results);

  const remaining = await Promise.all(PROBES.slice(1).map(async (probe) => {
    try { return await probeRequest(target, pinned, probe); }
    catch { return { id: probe.id, status: 0, headers: {}, body: Buffer.alloc(0), truncated: false } as ProbeResult; }
  }));
  for (const result of remaining) results[result.id] = result;
  return classifyReadinessV2(target.origin.slice(0, -1), results);
}
