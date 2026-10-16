const INTEGRATION_CLASSES = Object.freeze(['cli','sdk','mcp','agent-skill','framework-adapter','rest-openapi','other']);
const DEPLOYMENT_CLASSES = Object.freeze(['local','hosted','private-l1']);
const MODES = Object.freeze(['shadow','active']);
const DECISIONS = Object.freeze(['USE','DO_NOT_USE','INSUFFICIENT']);
const WORKLOAD_CLASSES = Object.freeze(['web-research','browser-automation','extraction','api-validation','mcp-tools','agent-tools','monitoring','other']);

export const ADOPTION_REPORT_ENDPOINT = 'https://seenrelay.com/v1/adoption-report';

function oneOf(name, value, allowed) {
  if (!allowed.includes(value)) throw new TypeError(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

export function buildAdoptionReportPayload(input, seenrelayVersion) {
  if (typeof seenrelayVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[+-][0-9A-Za-z.-]+)?$/.test(seenrelayVersion)) {
    throw new TypeError('seenrelay version is invalid');
  }
  return {
    schema_version: 'seenrelay-adoption-report-v1',
    seenrelay_version: seenrelayVersion,
    integration_class: oneOf('--integration-class', input.integrationClass, INTEGRATION_CLASSES),
    deployment_class: oneOf('--deployment', input.deploymentClass, DEPLOYMENT_CLASSES),
    mode: oneOf('--mode', input.mode, MODES),
    decision: oneOf('--decision', input.decision, DECISIONS),
    workload_class: oneOf('--workload-class', input.workloadClass, WORKLOAD_CLASSES)
  };
}

export function adoptionReportPrivacyBoundary() {
  return {
    sends: ['seenrelay_version','integration_class','deployment_class','mode','decision','workload_class'],
    excludes: ['prompt','response','source_url','fact_or_value','repository','filename','customer_identity','actor_id','ip_as_identity','user_agent'],
    default_network_contact: false,
    share_requires_explicit_flag: true,
    unique_actor_claim: false
  };
}

export async function shareAdoptionReport(payload, { fetchImpl = globalThis.fetch, endpoint = ADOPTION_REPORT_ENDPOINT } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok) throw new Error(`adoption-report share failed: HTTP ${response.status}`);
  return body;
}

export function renderAdoptionReport(result) {
  const p = result.payload;
  const lines = [
    'SeenRelay Adoption Report',
    '',
    `Version: ${p.seenrelay_version}`,
    `Integration: ${p.integration_class}`,
    `Deployment: ${p.deployment_class}`,
    `Mode: ${p.mode}`,
    `Decision: ${p.decision}`,
    `Workload: ${p.workload_class}`,
    '',
    result.shared
      ? 'Shared: yes — one privacy-bounded aggregate counter was incremented.'
      : 'Shared: no — preview only. Add --share to opt in.',
    'No actor ID, repository, filename, prompt, response, source URL, fact/value or customer identity is included.'
  ];
  return lines.join('\\n') + '\\n';
}
