import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const crypto=webcrypto;
const BASE=process.env.SEENRELAY_PREVIEW_BASE;
const TARGET_SHA=process.env.TARGET_PREVIEW_SHA;
const BYPASS=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const CONTRACT_FP=process.env.ACTION_CONTRACT_FINGERPRINT;
const FACT_FP=process.env.ACTION_FACT_FINGERPRINT;
const OUT=process.env.ACTION_OUTPUT||'';
const MODE=process.argv[2];
const EPOCH='private280-action-608735-v2';
if(!BASE||!TARGET_SHA||!BYPASS||!CONTRACT_FP||!FACT_FP)throw new Error('required environment missing');
if(!['observe','qualify'].includes(MODE))throw new Error('usage: node preview-check-action-v3-setup.mjs <observe|qualify>');

function stable(v){if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('non-finite');return JSON.stringify(v);}if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;throw new Error('unsupported');}
const sha256=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex')}`;
const b64url=x=>Buffer.from(x instanceof ArrayBuffer?new Uint8Array(x):x).toString('base64url');
function fact(){return{subject:'Preview CHECK controlled measurement',predicate:'version.current',qualifiers:{measurement_epoch:EPOCH,target_sha:TARGET_SHA},source:`${BASE}/api/resource`,locator:{scheme:'source_key',value:'version'}};}
assert.equal(sha256(fact()),FACT_FP,'fact coordinate fingerprint drift');
async function request(path,init={}){return fetch(`${BASE}${path}`,{...init,headers:{...(init.headers||{}),'x-vercel-protection-bypass':BYPASS},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});}
async function health(){const r=await request('/healthz');assert.equal(r.status,200);const b=await r.json();assert.equal(b.environment,'preview');assert.equal(b.deployment_sha,TARGET_SHA);}
async function source(){const r=await request('/api/resource',{headers:{accept:'text/plain'}});assert.equal(r.status,200);assert.equal(r.headers.get('x-seenrelay-fixture-commit'),TARGET_SHA);assert.equal(r.headers.get('x-seenrelay-fixture-revision'),'preview-http-fixture-v1');const text=await r.text();assert.equal(text,'version=1\n');const etag=r.headers.get('etag');assert.ok(etag);return{text,etag};}
function timing(raw){const out=new Map();for(const item of String(raw||'').split(',')){const [name,...ps]=item.trim().split(';');for(const p of ps){const m=/^dur=([0-9]+(?:\.[0-9]+)?)$/.exec(p.trim());if(m)out.set(name.trim(),Number(m[1]));}}return out;}

async function observe(){
  await health();const s=await source();
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const publicKey=b64url(await crypto.subtle.exportKey('raw',pair.publicKey));
  const timestamp=new Date().toISOString();
  const proofBase={scheme:'ed25519-v1',public_key:publicKey,timestamp,nonce:b64url(crypto.getRandomValues(new Uint8Array(24)))};
  const unsigned={fact:fact(),value:1,observed_at:timestamp,evidence_fingerprint:sha256(s.text),source_validator:{kind:'etag',value:s.etag}};
  const payload=stable({domain:'seenrelay-observe-proof-v1',operation:'OBSERVE',payload:unsigned,proof:proofBase});
  const signature=b64url(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(payload)));
  const r=await request('/v1/observe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...unsigned,observer_proof:{...proofBase,signature}})});
  assert.equal(r.status,200);const b=await r.json();assert.equal(b.observer_identity,'cryptographic_key');assert.equal(b.observer_assurance,'proof_of_possession');assert.equal(b.source_validator_recorded,true);assert.ok(b.accepted===true||b.deduplicated===true);
  console.log(JSON.stringify({schema:'seenrelay-preview-action-setup-observer-v2',target_sha:TARGET_SHA,contract_fingerprint:CONTRACT_FP,fact_coordinate_fingerprint:FACT_FP,source_validated:true,cryptographic_proof_accepted:true,source_validator_recorded:true,raw_key_material_emitted:false,raw_lease_emitted:false,raw_network_identifier_emitted:false}));
}
async function qualify(){
  await health();const s=await source();let body=null,res=null;
  for(let attempt=1;attempt<=12;attempt++){
    res=await request('/v1/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fact:fact(),known_value:1,max_age_seconds:600})});
    assert.equal(res.status,200);body=await res.json();
    if(body.status==='SAME_OBSERVED'&&Number(body.recent_cryptographic_observer_keys)>=2&&Number(body.recent_reuse_independence_buckets)>=2)break;
    await new Promise(r=>setTimeout(r,1000));
  }
  assert.ok(body&&res);assert.equal(body.status,'SAME_OBSERVED');assert.equal(body.known_value_hash,body.latest_value_hash);assert.ok(Number(body.recent_observer_keys)>=2);assert.ok(Number(body.recent_cryptographic_observer_keys)>=2);assert.ok(Number(body.recent_reuse_independence_buckets)>=2);assert.ok(Number(body.age_seconds)<=600);assert.equal(body.source_validator?.kind,'etag');assert.equal(body.source_validator?.value,s.etag);
  assert.equal(res.headers.get('x-seenrelay-lab-check-timing'),'v1');assert.equal(res.headers.get('x-seenrelay-lab-check-commit'),TARGET_SHA);const st=timing(res.headers.get('server-timing'));assert.ok(st.get('app')>0&&st.get('cpu')>0);
  const core={schema:'seenrelay-preview-action-setup-qualification-v2',qualified:true,status:'SAME_OBSERVED',target_sha:TARGET_SHA,contract_fingerprint:CONTRACT_FP,fact_coordinate_fingerprint:FACT_FP,observer_keys:Number(body.recent_observer_keys),cryptographic_observer_keys:Number(body.recent_cryptographic_observer_keys),reuse_independence_buckets:Number(body.recent_reuse_independence_buckets),known_value_hash_equals_latest_value_hash:true,age_seconds:Number(body.age_seconds),source_validator_present:true,source_validator_fingerprint:sha256(s.etag),server_timing_app_present:true,server_timing_cpu_present:true,independent_real_world_actor_claim:false,setup_cost_is_zero:false,raw_lease_emitted:false,raw_network_identifier_emitted:false};
  const out={...core,evidence_fingerprint:sha256(core)};if(OUT)writeFileSync(OUT,`${JSON.stringify(out,null,2)}\n`,{flag:'wx'});console.log(JSON.stringify(out,null,2));
}
if(MODE==='observe')await observe();else await qualify();
