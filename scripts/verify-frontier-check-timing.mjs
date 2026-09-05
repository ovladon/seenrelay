import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';

const crypto = webcrypto;
const BASE = process.env.SEENRELAY_PREVIEW_BASE;
const TARGET_SHA = process.env.TARGET_PREVIEW_SHA;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const RUN_ID = process.env.GITHUB_RUN_ID;
const MODE = process.argv[2];

if (!BASE || !TARGET_SHA || !BYPASS || !RUN_ID) throw new Error('required environment is missing');
if (!['observe','check'].includes(MODE)) throw new Error('usage: node verify-frontier-check-timing.mjs <observe|check>');

function b64url(bytes) { return Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes).toString('base64url'); }
function stableJson(value) {
  const walk = (v) => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return JSON.stringify(v);
    if (typeof v === 'number') { if (!Number.isFinite(v)) throw new Error('non-finite number'); return JSON.stringify(v); }
    if (Array.isArray(v)) return `[${v.map(walk).join(',')}]`;
    if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k)=>`${JSON.stringify(k)}:${walk(v[k])}`).join(',')}}`;
    throw new Error('unsupported JSON value');
  };
  return walk(value);
}
function parseServerTiming(raw) {
  const out = new Map();
  for (const item of String(raw || '').split(',')) {
    const [name, ...params] = item.trim().split(';');
    for (const param of params) {
      const m = /^dur=([0-9]+(?:\.[0-9]+)?)$/.exec(param.trim());
      if (m) out.set(name.trim(), Number(m[1]));
    }
  }
  return out;
}
function fact() {
  return {
    subject:'Preview CHECK timing qualification',
    predicate:'version.current',
    qualifiers:{qualification_run:String(RUN_ID),qualification_family:'check-timing-v1'},
    source:`${BASE}/api/resource`,
    locator:{scheme:'source_key',value:'version'}
  };
}
async function request(path, init={}) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers:{...(init.headers||{}),'x-vercel-protection-bypass':BYPASS},
    cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)
  });
}
async function exactHealth() {
  const response=await request('/healthz');
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.environment,'preview');
  assert.equal(body.deployment_sha,TARGET_SHA,'health deployment SHA drift');
}
async function observe() {
  await exactHealth();
  const source=await request('/api/resource',{headers:{accept:'text/plain'}});
  assert.equal(source.status,200);
  assert.equal(source.headers.get('x-seenrelay-fixture-commit'),TARGET_SHA,'source deployment SHA drift');
  const sourceBody=await source.text();
  assert.equal(sourceBody,'version=1\n');
  const evidenceFingerprint=`sha256:${createHash('sha256').update(sourceBody).digest('hex')}`;

  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const publicKey=b64url(await crypto.subtle.exportKey('raw',pair.publicKey));
  const timestamp=new Date().toISOString();
  const proofBase={scheme:'ed25519-v1',public_key:publicKey,timestamp,nonce:b64url(crypto.getRandomValues(new Uint8Array(24)))};
  const unsigned={fact:fact(),value:1,observed_at:timestamp,evidence_fingerprint:evidenceFingerprint};
  const payload=stableJson({domain:'seenrelay-observe-proof-v1',operation:'OBSERVE',payload:unsigned,proof:proofBase});
  const signature=b64url(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(payload)));
  const response=await request('/v1/observe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...unsigned,observer_proof:{...proofBase,signature}})});
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.observer_identity,'cryptographic_key');
  assert.equal(body.observer_assurance,'proof_of_possession');
  assert.ok(body.accepted===true||body.deduplicated===true);
  console.log(JSON.stringify({schema:'seenrelay-preview-check-timing-observer-v1',source_validated:true,target_sha:TARGET_SHA,cryptographic_proof_accepted:true,raw_key_material_emitted:false,raw_network_identifier_emitted:false,raw_lease_emitted:false}));
}
async function check() {
  await exactHealth();
  let body=null,response=null;
  for (let attempt=1;attempt<=12;attempt++) {
    response=await request('/v1/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fact:fact(),known_value:1,max_age_seconds:600})});
    assert.equal(response.status,200);
    body=await response.json();
    if (body.status==='SAME_OBSERVED'&&Number(body.recent_cryptographic_observer_keys)>=2&&Number(body.recent_reuse_independence_buckets)>=2) break;
    await new Promise((resolve)=>setTimeout(resolve,1000));
  }
  assert.ok(response&&body);
  assert.equal(body.status,'SAME_OBSERVED');
  assert.ok(Number(body.recent_observer_keys)>=2);
  assert.ok(Number(body.recent_cryptographic_observer_keys)>=2);
  assert.ok(Number(body.recent_reuse_independence_buckets)>=2);
  assert.equal(response.headers.get('x-seenrelay-lab-check-timing'),'v1');
  assert.equal(response.headers.get('x-seenrelay-lab-check-commit'),TARGET_SHA,'CHECK timing commit drift');
  const timing=parseServerTiming(response.headers.get('server-timing'));
  assert.ok(Number.isFinite(timing.get('app'))&&timing.get('app')>0,'CHECK app timing missing');
  assert.ok(Number.isFinite(timing.get('cpu'))&&timing.get('cpu')>0,'CHECK CPU timing missing');
  console.log(JSON.stringify({schema:'seenrelay-preview-check-timing-qualification-v1',qualified:true,target_sha:TARGET_SHA,status:body.status,observer_keys:Number(body.recent_observer_keys),cryptographic_observer_keys:Number(body.recent_cryptographic_observer_keys),reuse_independence_buckets:Number(body.recent_reuse_independence_buckets),server_timing_app_present:true,server_timing_cpu_present:true,independent_real_world_actor_claim:false,raw_network_identifier_emitted:false,raw_lease_emitted:false},null,2));
}
if (MODE==='observe') await observe(); else await check();
