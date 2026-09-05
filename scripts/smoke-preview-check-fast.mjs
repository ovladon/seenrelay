import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

const crypto = webcrypto;
const MODE = process.argv[2];
const CURRENT_BASE = process.env.SEENRELAY_PREVIEW_BASE;
const SOURCE_BASE = process.env.SEENRELAY_SOURCE_BASE;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!CURRENT_BASE || !SOURCE_BASE || !BYPASS) throw new Error('required environment missing');
if (!['observe','measure'].includes(MODE)) throw new Error('usage: node smoke-preview-check-fast.mjs <observe|measure>');

function stable(v){if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('non-finite');return JSON.stringify(v);}if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;throw new Error('unsupported');}
const b64url=x=>Buffer.from(x instanceof ArrayBuffer?new Uint8Array(x):x).toString('base64url');
const fact=()=>({subject:'Preview CHECK controlled measurement',predicate:'version.current',qualifiers:{measurement_epoch:'private280-action-608735-v2',target_sha:'608735e6137a8fdef873d38d24491fe037399ffc'},source:`${SOURCE_BASE}/api/resource`,locator:{scheme:'source_key',value:'version'}});
async function req(base,path,init={},timeoutMs=15000){return fetch(`${base}${path}`,{...init,headers:{...(init.headers||{}),'x-vercel-protection-bypass':BYPASS},cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});}
async function source(){const r=await req(SOURCE_BASE,'/api/resource',{headers:{accept:'text/plain'}});assert.equal(r.status,200);const text=await r.text();assert.equal(text,'version=1\n');const etag=r.headers.get('etag');assert.ok(etag);return{text,etag};}
function timing(raw){const out={};for(const item of String(raw||'').split(',')){const [name,...ps]=item.trim().split(';');for(const p of ps){const m=/^dur=([0-9]+(?:\.[0-9]+)?)$/.exec(p.trim());if(m)out[name.trim()]=Number(m[1]);}}return out;}
async function observe(){
  const s=await source();
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  const publicKey=b64url(await crypto.subtle.exportKey('raw',pair.publicKey));
  const timestamp=new Date().toISOString();
  const proofBase={scheme:'ed25519-v1',public_key:publicKey,timestamp,nonce:b64url(crypto.getRandomValues(new Uint8Array(24)))};
  const unsigned={fact:fact(),value:1,observed_at:timestamp,evidence_fingerprint:'smoke-fast-check',source_validator:{kind:'etag',value:s.etag}};
  const payload=stable({domain:'seenrelay-observe-proof-v1',operation:'OBSERVE',payload:unsigned,proof:proofBase});
  const signature=b64url(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(payload)));
  const r=await req(CURRENT_BASE,'/v1/observe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...unsigned,observer_proof:{...proofBase,signature}})});
  assert.equal(r.status,200);const b=await r.json();assert.equal(b.observer_identity,'cryptographic_key');assert.equal(b.observer_assurance,'proof_of_possession');assert.equal(b.source_validator_recorded,true);assert.ok(b.accepted===true||b.deduplicated===true);
  console.log(JSON.stringify({schema:'seenrelay-smoke-fast-observe-v1',ok:true,raw_key_material_emitted:false,raw_lease_emitted:false}));
}
function core(b){return{status:b.status,known_value_hash:b.known_value_hash,latest_value_hash:b.latest_value_hash,recent_observations:Number(b.recent_observations),recent_observer_keys:Number(b.recent_observer_keys),recent_cryptographic_observer_keys:Number(b.recent_cryptographic_observer_keys),recent_unverified_observer_keys:Number(b.recent_unverified_observer_keys),recent_reuse_independence_buckets:Number(b.recent_reuse_independence_buckets),source_validator:b.source_validator};}
async function measure(){
  const s=await source(); const requestBody={fact:fact(),known_value:1,max_age_seconds:600};
  const normal=await req(CURRENT_BASE,'/v1/check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(requestBody)});assert.equal(normal.status,200);const normalBody=await normal.json();assert.equal(normalBody.status,'SAME_OBSERVED');assert.ok(Number(normalBody.recent_cryptographic_observer_keys)>=2);assert.ok(Number(normalBody.recent_reuse_independence_buckets)>=2);
  let lease=normal.headers.get('x-seenrelay-lease')||''; assert.ok(lease,'normal CHECK must establish a valid lease'); const samples=[];
  for(let i=0;i<12;i++){
    const headers={'content-type':'application/json','x-seenrelay-lease':lease};
    const r=await req(CURRENT_BASE,'/api/check-fast-web-timed',{method:'POST',headers,body:JSON.stringify(requestBody)},i===0?60000:15000);assert.equal(r.status,200);const b=await r.json();assert.equal(b.status,'SAME_OBSERVED');assert.deepEqual(core(b),core(normalBody));assert.equal(b.source_validator?.kind,'etag');assert.equal(b.source_validator?.value,s.etag);assert.ok(Number(b.recent_cryptographic_observer_keys)>=2);assert.ok(Number(b.recent_reuse_independence_buckets)>=2);
    lease=r.headers.get('x-seenrelay-lease')||lease;assert.ok(lease);
    const st=timing(r.headers.get('server-timing'));assert.ok(st.app>0&&st.cpu>0);
    samples.push({trial:i+1,app_ms:st.app,cpu_ms:st.cpu,lease_present:true,useful_reuse_awards:Number(b.useful_reuse_awards||0)});
  }
  const steady=samples.slice(1),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,median=xs=>{const a=[...xs].sort((x,y)=>x-y);const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2;};
  console.log(JSON.stringify({schema:'seenrelay-smoke-fast-measure-v3',semantic_parity:true,trials:samples.length,lease_bootstrapped_by_reference_check:true,first_candidate_trial_is_bundle_warmup:true,web_signature_adapter:true,first_trial:samples[0],steady_app_mean_ms:mean(steady.map(x=>x.app_ms)),steady_app_median_ms:median(steady.map(x=>x.app_ms)),steady_cpu_mean_ms:mean(steady.map(x=>x.cpu_ms)),steady_cpu_median_ms:median(steady.map(x=>x.cpu_ms)),samples,raw_lease_emitted:false},null,2));
}
if(MODE==='observe')await observe();else await measure();
