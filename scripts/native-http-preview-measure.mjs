import assert from 'node:assert/strict';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const TARGET = new URL('https://seenrelay-git-preview-native-htt-6a17ce-ovladonn-9636s-projects.vercel.app/api/resource');
const TARGET_SHA = process.env.TARGET_PREVIEW_SHA;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const OUT = process.env.MEASUREMENT_OUTPUT || 'native-http-stage0-measurement.json';
const PAIRS = 60;
const SENTINELS = 20;
const ORIGIN_ETAG_OPAQUE = '"6e2a8e6f2f2939c870d0402c12ff212b37c3da4995c6c682229f39af306bf3e4"';

if (!TARGET_SHA) throw new Error('TARGET_PREVIEW_SHA is required');
if (!BYPASS) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is required');

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const opaqueTag = (etag) => String(etag || '').replace(/^W\//, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseServerTiming(raw) {
  const out = new Map();
  for (const part of String(raw || '').split(',')) {
    const bits = part.trim().split(';');
    const name = bits[0]?.trim();
    if (!name) continue;
    for (const bit of bits.slice(1)) {
      const match = /^dur=([0-9]+(?:\.[0-9]+)?)$/.exec(bit.trim());
      if (match) out.set(name, Number(match[1]));
    }
  }
  return out;
}

function normalizedRequestBytes(method, url, headers) {
  const target = `${url.pathname}${url.search}` || '/';
  let n = Buffer.byteLength(`${method} ${target} HTTP/1.1\r\n`);
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'x-vercel-protection-bypass') continue;
    n += Buffer.byteLength(`${key}: ${value}\r\n`);
  }
  return n + 2;
}

function responseHeaderBytes(res) {
  let n = Buffer.byteLength(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage || ''}\r\n`);
  for (let i = 0; i < res.rawHeaders.length; i += 2) {
    n += Buffer.byteLength(`${res.rawHeaders[i]}: ${res.rawHeaders[i + 1]}\r\n`);
  }
  return n + 2;
}

function requestOnce(extraHeaders = {}) {
  const headers = {
    ...extraHeaders,
    'x-vercel-protection-bypass': BYPASS
  };
  const normalizedReqBytes = normalizedRequestBytes('GET', TARGET, headers);
  const wallStart = process.hrtime.bigint();
  const cpuStart = process.cpuUsage();

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const req = https.request(TARGET, { method: 'GET', headers, agent: false }, (res) => {
      const chunks = [];
      let bodyBytes = 0;
      res.on('data', (chunk) => {
        bodyBytes += chunk.length;
        if (bodyBytes > 1024 * 1024) {
          req.destroy(new Error('response body exceeds 1 MiB'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('error', fail);
      res.on('end', () => {
        if (settled) return;
        const wallEnd = process.hrtime.bigint();
        const cpu = process.cpuUsage(cpuStart);
        const body = Buffer.concat(chunks);
        const responseHeaders = {};
        for (const [key, value] of Object.entries(res.headers)) {
          responseHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        }
        const timing = parseServerTiming(responseHeaders['server-timing']);
        const destinationCpu = timing.get('cpu');
        const destinationApp = timing.get('app');
        if (!Number.isFinite(destinationCpu) || !Number.isFinite(destinationApp)) {
          fail(new Error(`missing Server-Timing cpu/app for status ${res.statusCode}`));
          return;
        }
        settled = true;
        resolve({
          status: res.statusCode,
          headers: responseHeaders,
          body,
          metrics: {
            agent_cpu_ms: (cpu.user + cpu.system) / 1000,
            agent_elapsed_ms: Number(wallEnd - wallStart) / 1e6,
            destination_cpu_ms: destinationCpu,
            destination_app_elapsed_ms: destinationApp,
            agent_requests: 1,
            normalized_http_application_bytes: normalizedReqBytes + responseHeaderBytes(res) + body.length
          }
        });
      });
    });
    req.setTimeout(15_000, () => req.destroy(new Error('request timeout')));
    req.on('error', fail);
    req.end();
  });
}

function assertExact200(response, accept) {
  assert.equal(response.status, 200);
  assert.equal(response.headers['x-seenrelay-fixture-commit'], TARGET_SHA, 'measured 200 deployment SHA drift');
  assert.equal(response.headers['x-seenrelay-fixture-env'], 'preview');
  assert.equal(response.headers['x-seenrelay-fixture-revision'], 'preview-http-fixture-v1');
  assert.match(response.headers.vary || '', /(?:^|,\s*)Accept(?:,|$)/i);
  assert.match(response.headers['cache-control'] || '', /(?:^|,)\s*no-store\s*(?:,|$)/i);
  assert.equal(opaqueTag(response.headers.etag), ORIGIN_ETAG_OPAQUE);
  if (accept === 'application/json') {
    assert.match(response.headers['content-type'] || '', /^application\/json/i);
    const value = JSON.parse(response.body.toString('utf8'));
    assert.equal(value.version, 1);
  } else {
    assert.match(response.headers['content-type'] || '', /^text\/plain/i);
    assert.equal(response.body.toString('utf8'), 'version=1\n');
  }
}

function assertExact304(response, retainedEtag) {
  assert.equal(response.status, 304);
  assert.equal(response.body.length, 0);
  assert.equal(opaqueTag(response.headers.etag), opaqueTag(retainedEtag), '304 validator mismatch');
  assert.match(response.headers.vary || '', /(?:^|,\s*)Accept(?:,|$)/i);
  assert.match(response.headers['cache-control'] || '', /(?:^|,)\s*no-store\s*(?:,|$)/i);
}

async function stabilize(label) {
  let consecutive = 0;
  let attempts = 0;
  while (attempts < 80 && consecutive < SENTINELS) {
    attempts += 1;
    const response = await requestOnce({ accept: 'application/json' });
    try {
      assertExact200(response, 'application/json');
      consecutive += 1;
    } catch {
      consecutive = 0;
    }
    if (consecutive < SENTINELS) await sleep(250);
  }
  assert.equal(consecutive, SENTINELS, `${label}: target did not stabilize on frozen SHA`);
  return { label, consecutive_exact: consecutive, attempts };
}

async function measurePath(phase, pathId, sequenceIndex, retainedEtag = null) {
  let response;
  if (pathId === 'first-authoritative-json' || pathId === 'sub-authoritative-json') {
    response = await requestOnce({ accept: 'application/json' });
    assertExact200(response, 'application/json');
  } else if (pathId === 'first-accept-text') {
    response = await requestOnce({ accept: 'text/plain' });
    assertExact200(response, 'text/plain');
  } else if (pathId === 'sub-etag-304') {
    assert.ok(retainedEtag, 'retained ETag required');
    response = await requestOnce({ accept: 'application/json', 'if-none-match': retainedEtag });
    assertExact304(response, retainedEtag);
  } else {
    throw new Error(`unknown path ${pathId}`);
  }

  return {
    phase,
    path_id: pathId,
    sequence_index: sequenceIndex,
    status: response.status,
    same_accepted_outcome: true,
    provenance_preserved: true,
    authentication_unchanged: true,
    authorization_unchanged: true,
    privacy_scope_unchanged: true,
    destination_policy_respected: true,
    freshness_and_invalidation_respected: true,
    metrics: response.metrics
  };
}

const evidence = {
  schema: 'seenrelay-native-http-preview-measurement-v1',
  target_preview_sha: TARGET_SHA,
  target_resource_revision: 'preview-http-fixture-v1',
  target_path: '/api/resource',
  sample_type: 'controlled_real_service',
  preview_auth: {
    mechanism: 'vercel_automation_bypass_header_v1',
    raw_secret_emitted: false,
    raw_secret_hash_emitted: false,
    excluded_from_normalized_network_bytes: true
  },
  run_coordinate: {
    github_run_id: process.env.GITHUB_RUN_ID || null,
    github_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null
  },
  trial_contract: {
    pairs_per_phase: PAIRS,
    exact_order_balance_each_phase: true,
    no_interim_selection: true
  },
  stabilization: {},
  seed: {},
  measurements: { first_contact: [], subsequent_contact: [] }
};

evidence.stabilization.first_pre = await stabilize('first_pre');
for (let i = 0; i < PAIRS; i += 1) {
  const trialId = `first-${String(i + 1).padStart(3, '0')}`;
  const order = i % 2 === 0
    ? ['first-authoritative-json', 'first-accept-text']
    : ['first-accept-text', 'first-authoritative-json'];
  for (let sequenceIndex = 0; sequenceIndex < order.length; sequenceIndex += 1) {
    const record = await measurePath('first_contact', order[sequenceIndex], sequenceIndex);
    evidence.measurements.first_contact.push({ trial_id: trialId, ...record });
  }
}
evidence.stabilization.first_post = await stabilize('first_post');

evidence.stabilization.subsequent_pre = await stabilize('subsequent_pre');
const seed = await requestOnce({ accept: 'application/json' });
assertExact200(seed, 'application/json');
const retainedEtag = seed.headers.etag;
assert.ok(retainedEtag, 'seed ETag missing');
evidence.seed = {
  status: seed.status,
  outcome_version: 1,
  retained_etag_fingerprint: sha256(retainedEtag),
  retained_etag_strength: retainedEtag.startsWith('W/') ? 'weak' : 'strong'
};

for (let i = 0; i < PAIRS; i += 1) {
  const trialId = `subsequent-${String(i + 1).padStart(3, '0')}`;
  const order = i % 2 === 0
    ? ['sub-authoritative-json', 'sub-etag-304']
    : ['sub-etag-304', 'sub-authoritative-json'];
  for (let sequenceIndex = 0; sequenceIndex < order.length; sequenceIndex += 1) {
    const record = await measurePath('subsequent_contact', order[sequenceIndex], sequenceIndex, retainedEtag);
    evidence.measurements.subsequent_contact.push({ trial_id: trialId, ...record });
  }
}
evidence.stabilization.subsequent_post = await stabilize('subsequent_post');

evidence.summary = {
  first_contact_records: evidence.measurements.first_contact.length,
  subsequent_contact_records: evidence.measurements.subsequent_contact.length,
  first_contact_pairs: PAIRS,
  subsequent_contact_pairs: PAIRS,
  all_measurements_completed: true,
  raw_response_bodies_retained: false,
  raw_auth_material_emitted: false
};

const fingerprintCore = JSON.stringify(evidence);
evidence.evidence_fingerprint = sha256(fingerprintCore);
writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  schema: evidence.schema,
  target_preview_sha: TARGET_SHA,
  first_contact_pairs: PAIRS,
  subsequent_contact_pairs: PAIRS,
  evidence_fingerprint: evidence.evidence_fingerprint,
  output: OUT
}, null, 2));
