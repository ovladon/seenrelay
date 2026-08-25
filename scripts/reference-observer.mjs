import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const OBSERVER_ID = 'seenrelay-reference-observer-v1';
export const DEFAULT_ORIGIN = 'https://seenrelay.com';
export const SCHEDULE_MINUTES = 30;
export const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

export const SOURCES = [
  { id:'github-status-indicator', subject:'GitHub overall status indicator', predicate:'status.indicator', source:'https://www.githubstatus.com/api/v2/status.json', locator:{scheme:'json_pointer',value:'/status/indicator'}, period_minutes:30 },
  { id:'github-status-description', subject:'GitHub overall status description', predicate:'status.description', source:'https://www.githubstatus.com/api/v2/status.json', locator:{scheme:'json_pointer',value:'/status/description'}, period_minutes:30 },
  { id:'node-latest-version', subject:'Latest Node.js release version', predicate:'version.latest', source:'https://nodejs.org/dist/index.json', locator:{scheme:'json_pointer',value:'/0/version'}, period_minutes:360 },
  { id:'pypi-openai-version', subject:'Latest openai Python package version', predicate:'version.latest', source:'https://pypi.org/pypi/openai/json', locator:{scheme:'json_pointer',value:'/info/version'}, period_minutes:360 },
  { id:'pypi-anthropic-version', subject:'Latest anthropic Python package version', predicate:'version.latest', source:'https://pypi.org/pypi/anthropic/json', locator:{scheme:'json_pointer',value:'/info/version'}, period_minutes:360 },
  { id:'pypi-mcp-version', subject:'Latest mcp Python package version', predicate:'version.latest', source:'https://pypi.org/pypi/mcp/json', locator:{scheme:'json_pointer',value:'/info/version'}, period_minutes:360 },
  { id:'pypi-langchain-version', subject:'Latest langchain Python package version', predicate:'version.latest', source:'https://pypi.org/pypi/langchain/json', locator:{scheme:'json_pointer',value:'/info/version'}, period_minutes:360 },
  { id:'pypi-llama-index-version', subject:'Latest llama-index Python package version', predicate:'version.latest', source:'https://pypi.org/pypi/llama-index/json', locator:{scheme:'json_pointer',value:'/info/version'}, period_minutes:360 },
  { id:'npm-openai-version', subject:'Latest openai npm package version', predicate:'version.latest', source:'https://registry.npmjs.org/openai/latest', locator:{scheme:'json_pointer',value:'/version'}, period_minutes:360 },
  { id:'npm-anthropic-sdk-version', subject:'Latest Anthropic npm SDK version', predicate:'version.latest', source:'https://registry.npmjs.org/@anthropic-ai%2Fsdk/latest', locator:{scheme:'json_pointer',value:'/version'}, period_minutes:360 },
  { id:'npm-mcp-sdk-version', subject:'Latest Model Context Protocol npm SDK version', predicate:'version.latest', source:'https://registry.npmjs.org/@modelcontextprotocol%2Fsdk/latest', locator:{scheme:'json_pointer',value:'/version'}, period_minutes:360 }
];

export function jsonPointer(value, pointer) {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) throw new Error(`Invalid JSON pointer: ${pointer}`);
  return pointer.slice(1).split('/').reduce((node, raw) => {
    const token = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || node === undefined || !(token in Object(node))) throw new Error(`JSON pointer not found: ${pointer}`);
    return node[token];
  }, value);
}

export function sourceDue(source, now = new Date()) {
  const period = Number(source.period_minutes);
  if (!Number.isInteger(period) || period < SCHEDULE_MINUTES || period % SCHEDULE_MINUTES !== 0) throw new Error(`Invalid period for ${source.id}`);
  const minute = Math.floor(now.getTime() / 60000);
  return (minute % period) < SCHEDULE_MINUTES;
}

function sourceValidator(headers) {
  const etag = headers.get('etag');
  if (etag) return { kind:'etag', value:etag.slice(0, 512) };
  const modified = headers.get('last-modified');
  if (modified) return { kind:'last_modified', value:modified.slice(0, 512) };
  return undefined;
}

export function buildObservePayload(source, parsed, rawBytes, now = new Date()) {
  const value = jsonPointer(parsed, source.locator.value);
  const slot = Math.floor(now.getTime() / (source.period_minutes * 60_000));
  return {
    fact: {
      subject: source.subject,
      predicate: source.predicate,
      source: source.source,
      locator: source.locator
    },
    value,
    observed_at: now.toISOString(),
    observer_id: OBSERVER_ID,
    evidence_fingerprint: `sha256:${createHash('sha256').update(rawBytes).digest('hex')}`,
    idempotency_key: `reference-observer/${source.id}/${slot}`
  };
}

async function readJsonResponse(response, source) {
  if (!response.ok) throw new Error(`${source.id}: source HTTP ${response.status}`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > MAX_SOURCE_BYTES) throw new Error(`${source.id}: source response too large`);
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > MAX_SOURCE_BYTES) throw new Error(`${source.id}: source response too large`);
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch { throw new Error(`${source.id}: invalid JSON`); }
  return { raw, parsed, validator: sourceValidator(response.headers) };
}

export async function runReferenceObserver({ fetchImpl = fetch, now = new Date(), origin = process.env.SEENRELAY_ORIGIN || DEFAULT_ORIGIN, logger = console } = {}) {
  const due = SOURCES.filter((source) => sourceDue(source, now));
  let lease = '';
  let observed = 0;
  let sourceFailures = 0;
  let submitFailures = 0;
  const sourceCache = new Map();

  const fetchSource = (source) => {
    if (!sourceCache.has(source.source)) {
      sourceCache.set(source.source, (async () => {
        const response = await fetchImpl(source.source, {
          headers: {
            accept: 'application/json',
            'user-agent': 'SeenRelay-Reference-Observer/0.1 (+https://seenrelay.com/data-practices)'
          },
          signal: AbortSignal.timeout(10_000)
        });
        return readJsonResponse(response, source);
      })());
    }
    return sourceCache.get(source.source);
  };

  for (const source of due) {
    let sourceResult;
    try {
      sourceResult = await fetchSource(source);
    } catch (error) {
      sourceFailures++;
      logger.warn(JSON.stringify({ event:'reference_observer_source_error', source:source.id, error:String(error?.message || error) }));
      continue;
    }

    const payload = buildObservePayload(source, sourceResult.parsed, sourceResult.raw, now);
    if (sourceResult.validator) payload.source_validator = sourceResult.validator;

    try {
      const headers = { 'content-type':'application/json', 'user-agent':'SeenRelay-Reference-Observer/0.1' };
      if (lease) headers['x-seenrelay-lease'] = lease;
      const response = await fetchImpl(`${origin.replace(/\/$/,'')}/v1/observe`, {
        method:'POST', headers, body:JSON.stringify(payload), signal:AbortSignal.timeout(10_000)
      });
      const nextLease = response.headers.get('x-seenrelay-lease');
      if (nextLease) lease = nextLease;
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`SeenRelay HTTP ${response.status}: ${body?.error?.code || 'unknown'}`);
      observed++;
      logger.log(JSON.stringify({ event:'reference_observer_submit', source:source.id, accepted:Boolean(body.accepted), observer_identity:body.observer_identity || null }));
    } catch (error) {
      submitFailures++;
      logger.error(JSON.stringify({ event:'reference_observer_submit_error', source:source.id, error:String(error?.message || error) }));
    }
  }

  const summary = { due:due.length, observed, source_failures:sourceFailures, submit_failures:submitFailures };
  logger.log(JSON.stringify({ event:'reference_observer_summary', ...summary }));
  if (submitFailures > 0) throw new Error(`Reference observer had ${submitFailures} SeenRelay submission failure(s)`);
  if (due.length > 0 && observed === 0) throw new Error('Reference observer produced no observations from due sources');
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReferenceObserver().catch((error) => { console.error(error); process.exitCode = 1; });
}
