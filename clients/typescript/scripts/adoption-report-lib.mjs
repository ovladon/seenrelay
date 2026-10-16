import { readFile } from 'node:fs/promises';

export const ADOPTION_REPORT_VALUES = Object.freeze({
  integration: ['cli','ambient','zero-state','fleet','classic','mcp','other'],
  deployment: ['local','hosted','private-l1'],
  mode: ['shadow','active'],
  verdict: ['USE','DO_NOT_USE','INSUFFICIENT_EVIDENCE'],
  workload: ['web-search','scraping','api-read','mcp-tool','llm-inference','compute','monitoring','other']
});

async function packageVersion() {
  const url = new URL('../package.json', import.meta.url);
  const pkg = JSON.parse(await readFile(url, 'utf8'));
  return String(pkg.version);
}

function requiredChoice(name, value, allowed) {
  if (!value) throw new TypeError(`--${name} is required`);
  if (!allowed.includes(value)) throw new TypeError(`--${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

export async function buildAdoptionReport(options) {
  return {
    schema: 'seenrelay-adoption-report-v1',
    seenrelay_version: await packageVersion(),
    integration_class: requiredChoice('integration', options.integration, ADOPTION_REPORT_VALUES.integration),
    deployment: requiredChoice('deployment', options.deployment, ADOPTION_REPORT_VALUES.deployment),
    mode: requiredChoice('mode', options.mode, ADOPTION_REPORT_VALUES.mode),
    verdict: requiredChoice('verdict', options.verdict, ADOPTION_REPORT_VALUES.verdict),
    workload_class: requiredChoice('workload', options.workload, ADOPTION_REPORT_VALUES.workload)
  };
}

export async function shareAdoptionReport(report, {
  endpoint = 'https://seenrelay.com/v1/adoption-report',
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is unavailable');
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {'content-type':'application/json'},
    body: JSON.stringify(report)
  });
  if (!response.ok) throw new Error(`SeenRelay adoption report rejected with HTTP ${response.status}`);
  return await response.json();
}

export function renderAdoptionReport(report, shared=false) {
  return `SeenRelay adoption report (${shared ? 'shared' : 'preview only'})\n\n${JSON.stringify(report,null,2)}\n\nNo prompt, response, source URL, fact/value, repo name, filename, customer identity, or IP-as-identity is included. Sharing is OFF unless --share is supplied.\n`;
}
