import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

const crypto = webcrypto;
const BASE = process.env.SEENRELAY_PREVIEW_BASE;
const TARGET_SHA = process.env.TARGET_PREVIEW_SHA;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const RUN_ID = process.env.GITHUB_RUN_ID;
const MODE = process.argv[2];

if (!BASE || !TARGET_SHA || !BYPASS || !RUN_ID) throw new Error('required environment is missing');
if (!['observe','check'].includes(MODE)) throw new Error('usage: node verify-preview-assurance-vantage.mjs <observe|check>');

function b64url(value) {
  return Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value).toString('base64url');
}

function assertNoUnpairedSurrogates(value) {
  if (typeof value === 'string') {
    for (let i=0;i<value.length;i++) {
      const code=value.charCodeAt(i);
      if (code>=0xd800&&code<=0xdbff) {
        const next=value.charCodeAt(i+1);
        if (!(next>=0xdc00&&next<=0xdfff)) throw new Error('unpaired Unicode surrogate');
        i += 1;
      } else if (code>=0xdc00&&code<=0xdfff) throw new Error('unpaired Unicode surrogate');
    }
  } else if (Array.isArray(value)) value.forEach(assertNoUnpairedSurrogates);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertNoUnpairedSurrogates);
}

function stableJson(value) {
  assertNoUnpairedSurrogates(value);
  const walk = (v) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('non-finite number');
      return JSON.stringify(v);
    }
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k)=>`${JSON.stringify(k)}:${walk(v[k])}`).join(',')}}`;
    throw new Error('unsupported JSON value');
  };
  return walk(value);
}

function fact() {
  return {
    subject: 'Preview assurance vantage fixture',
    predicate: 'version.current',
    qualifiers: { probe_run: String(RUN_ID) },
    source: `${BASE}/api/resource`,
    locator: { scheme: 'source_key', value: 'version' }
  };
}

async function request(path, init={}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'x-vercel-protection-bypass': BYPASS
    },
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
}

async function observe() {
  const source = await request('/api/resource', { headers: { accept: 'application/json' } });
  assert.equal(source.status, 200);
  assert.equal(source.headers.get('x-seenrelay-fixture-commit'), TARGET_SHA, 'source deployment SHA drift');
  const sourceBody = await source.text();
  const parsed = JSON.parse(sourceBody);
  assert.equal(parsed.version, 1);
  const sourceFingerprint = `sha256:${createHash('sha256').update(sourceBody).digest('hex')}`;

  const pair = await crypto.subtle.generateKey({name:'Ed25519'}, true, ['sign','verify']);
  const rawPublic = await crypto.subtle.exportKey('raw', pair.publicKey);
  const timestamp = new Date().toISOString();
  const proofBase = {
    scheme: 'ed25519-v1',
    public_key: b64url(rawPublic),
    timestamp,
    nonce: b64url(crypto.getRandomValues(new Uint8Array(24)))
  };
  const unsigned = {
    fact: fact(),
    value: 1,
    observed_at: timestamp,
    evidence_fingerprint: sourceFingerprint
  };
  const signingPayload = stableJson({
    domain: 'seenrelay-observe-proof-v1',
    operation: 'OBSERVE',
    payload: unsigned,
    proof: proofBase
  });
  const signature = await crypto.subtle.sign('Ed25519', pair.privateKey, new TextEncoder().encode(signingPayload));
  const body = {...unsigned, observer_proof: {...proofBase, signature:b64url(signature)}};

  const response = await request('/v1/observe', {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.observer_identity, 'cryptographic_key');
  assert.equal(result.observer_assurance, 'proof_of_possession');
  assert.equal(result.future_check_eligible, true);
  assert.ok(result.accepted === true || result.deduplicated === true);
  assert.ok(response.headers.get('x-seenrelay-lease'), 'Hive lease missing');

  console.log(JSON.stringify({
    schema:'seenrelay-preview-vantage-observer-v1',
    source_validated:true,
    source_deployment_sha:TARGET_SHA,
    observe_status:response.status,
    cryptographic_proof_accepted:true,
    raw_network_identifier_emitted:false,
    raw_lease_emitted:false,
    raw_key_material_emitted:false
  }));
}

async function check() {
  let last = null;
  for (let attempt=1; attempt<=12; attempt++) {
    const response = await request('/v1/check', {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({fact:fact(), known_value:1, max_age_seconds:600})
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    last = result;
    if (result.status === 'SAME_OBSERVED' &&
        Number(result.recent_observer_keys) >= 2 &&
        Number(result.recent_cryptographic_observer_keys) >= 2) break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  assert.ok(last, 'CHECK result missing');
  assert.equal(last.status, 'SAME_OBSERVED');
  assert.ok(Number(last.recent_observer_keys) >= 2, 'fewer than two observer keys');
  assert.ok(Number(last.recent_cryptographic_observer_keys) >= 2, 'fewer than two cryptographic observer keys');
  const buckets = Number(last.recent_reuse_independence_buckets || 0);
  assert.ok(buckets >= 2, `fewer than two reuse-independence buckets: ${buckets}`);

  console.log(JSON.stringify({
    schema:'seenrelay-preview-vantage-aggregate-v1',
    qualified:true,
    status:last.status,
    observer_keys:Number(last.recent_observer_keys),
    cryptographic_observer_keys:Number(last.recent_cryptographic_observer_keys),
    reuse_independence_buckets:buckets,
    raw_network_identifier_emitted:false,
    raw_lease_emitted:false,
    independent_real_world_actor_claim:false
  }, null, 2));
}

if (MODE === 'observe') await observe(); else await check();
