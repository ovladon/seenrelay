import assert from 'node:assert/strict';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BASE=process.env.SEENRELAY_PREVIEW_BASE;
const TARGET_SHA=process.env.TARGET_PREVIEW_SHA;
const BYPASS=process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const CONTRACT_FP=process.env.ACTION_CONTRACT_FINGERPRINT;
const FACT_FP=process.env.ACTION_FACT_FINGERPRINT;
const ENV_LABEL=process.env.CANDIDATE_ENVIRONMENT;
const OUT=process.env.ACTION_OUTPUT;
const RUN_ID=process.env.GITHUB_RUN_ID;
const EPOCH='private280-action-608735-v1';
const N=60;
if(!BASE||!TARGET_SHA||!BYPASS||!CONTRACT_FP||!FACT_FP||!ENV_LABEL||!OUT||!RUN_ID)throw new Error('required environment missing');
if(!['ubuntu','windows'].includes(ENV_LABEL))throw new Error('invalid candidate environment');
const target=new URL(`${BASE}/v1/check`);
function stable(v){if(v===null||typeof v==='string'||typeof v==='boolean')return JSON.stringify(v);if(typeof v==='number'){if(!Number.isFinite(v))throw new Error('non-finite');return JSON.stringify(v);}if(Array.isArray(v))return`[${v.map(stable).join(',')}]`;if(v&&typeof v==='object')return`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;throw new Error('unsupported');}
const sha256=v=>`sha256:${createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex')}`;
function fact(){return{subject:'Preview CHECK controlled measurement',predicate:'version.current',qualifiers:{measurement_epoch:EPOCH,target_sha:TARGET_SHA},source:`${BASE}/api/resource`,locator:{scheme:'source_key',value:'version'}};}
assert.equal(sha256(fact()),FACT_FP,'fact coordinate fingerprint drift');
function timing(raw){const out=new Map();for(const item of String(raw||'').split(',')){const [name,...ps]=item.trim().split(';');for(const p of ps){const m=/^dur=([0-9]+(?:\.[0-9]+)?)$/.exec(p.trim());if(m)out.set(name.trim(),Number(m[1]));}}return out;}
function requestBytes(method,path,headers,body){let n=Buffer.byteLength(`${method} ${path} HTTP/1.1\r\n`);for(const[k,v]of Object.entries(headers)){if(k.toLowerCase()==='x-vercel-protection-bypass')continue;n+=Buffer.byteLength(`${k}: ${v}\r\n`);}return n+2+body.length;}
function responseHeaderBytes(res){let n=Buffer.byteLength(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage||''}\r\n`);for(let i=0;i<res.rawHeaders.length;i+=2)n+=Buffer.byteLength(`${res.rawHeaders[i]}: ${res.rawHeaders[i+1]}\r\n`);return n+2;}
async function health(){const u=new URL(`${BASE}/healthz`);return new Promise((resolve,reject)=>{const req=https.request(u,{method:'GET',headers:{'x-vercel-protection-bypass':BYPASS},agent:false},res=>{const cs=[];res.on('data',c=>cs.push(c));res.on('end',()=>{try{assert.equal(res.statusCode,200);const b=JSON.parse(Buffer.concat(cs).toString());assert.equal(b.environment,'preview');assert.equal(b.deployment_sha,TARGET_SHA);resolve();}catch(e){reject(e);}});});req.setTimeout(15000,()=>req.destroy(new Error('health timeout')));req.on('error',reject);req.end();});}
function measuredCheck(lease){
  const body=Buffer.from(JSON.stringify({fact:fact(),known_value:1,max_age_seconds:600}));
  const headers={'accept':'application/json','content-type':'application/json','content-length':String(body.length),'x-vercel-protection-bypass':BYPASS,...(lease?{'x-seenrelay-lease':lease}:{})};
  const normalizedReq=requestBytes('POST',target.pathname,headers,body);const wall=process.hrtime.bigint(),cpu=process.cpuUsage();
  return new Promise((resolve,reject)=>{const req=https.request(target,{method:'POST',headers,agent:false},res=>{const cs=[];let bodyBytes=0;res.on('data',c=>{bodyBytes+=c.length;if(bodyBytes>1024*1024)req.destroy(new Error('body too large'));else cs.push(c);});res.on('end',()=>{try{const rawBody=Buffer.concat(cs);const hs={};for(const[k,v]of Object.entries(res.headers))hs[k.toLowerCase()]=Array.isArray(v)?v.join(', '):String(v??'');const st=timing(hs['server-timing']);assert.ok(Number.isFinite(st.get('cpu'))&&st.get('cpu')>0);assert.ok(Number.isFinite(st.get('app'))&&st.get('app')>0);const used=process.cpuUsage(cpu);resolve({status:res.statusCode,headers:hs,rawBody,metrics:{agent_cpu_ms:(used.user+used.system)/1000,agent_elapsed_ms:Number(process.hrtime.bigint()-wall)/1e6,relay_cpu_ms:st.get('cpu'),relay_app_elapsed_ms:st.get('app'),agent_requests:1,relay_outbound_requests:0,normalized_http_application_bytes:normalizedReq+responseHeaderBytes(res)+rawBody.length}});}catch(e){reject(e);}});});req.setTimeout(15000,()=>req.destroy(new Error('CHECK timeout')));req.on('error',reject);req.end(body);});
}
await health();let lease=null;const records=[];
for(let i=0;i<N;i++){
  const r=await measuredCheck(lease);assert.equal(r.status,200);assert.equal(r.headers['x-seenrelay-lab-check-timing'],'v1');assert.equal(r.headers['x-seenrelay-lab-check-commit'],TARGET_SHA);const nextLease=r.headers['x-seenrelay-lease'];assert.ok(nextLease);lease=nextLease;
  const b=JSON.parse(r.rawBody.toString('utf8'));assert.equal(b.status,'SAME_OBSERVED');assert.equal(b.known_value_hash,b.latest_value_hash);assert.ok(Number(b.recent_observer_keys)>=2);assert.ok(Number(b.recent_cryptographic_observer_keys)>=2);assert.ok(Number(b.recent_reuse_independence_buckets)>=2);assert.ok(Number(b.age_seconds)>=0&&Number(b.age_seconds)<=600);assert.equal(b.source_validator?.kind,'etag');assert.ok(b.source_validator?.value);
  records.push({trial_id:`candidate-${ENV_LABEL}-${String(i+1).padStart(3,'0')}`,http_status:r.status,assurance:{status:b.status,known_value_hash_equals_latest_value_hash:true,observer_keys:Number(b.recent_observer_keys),cryptographic_observer_keys:Number(b.recent_cryptographic_observer_keys),reuse_independence_buckets:Number(b.recent_reuse_independence_buckets),age_seconds:Number(b.age_seconds),contested:false,source_validator_present:true,server_timing_app_present:true,server_timing_cpu_present:true},accounting:{relay_measured:true,all_network_legs_included:true,authoritative_source_requests:0,authoritative_source_request_basis:'CHECK implementation is source-non-browsing and bound by the admitted source commit',platform_overhead_status:'UNKNOWN_NOT_ZERO',raw_lease_emitted:false,raw_response_body_retained:false,semantic_parse_cpu_included:false,agent_cpu_scope:'request_through_receive_accumulation_matching_native_collector'},metrics:r.metrics});
}
const core={schema:'seenrelay-preview-action-candidate-sample-v1',contract_fingerprint:CONTRACT_FP,target_preview_sha:TARGET_SHA,fact_coordinate_fingerprint:FACT_FP,sample_type:'controlled_real_service',caller_environment:ENV_LABEL,github_run_id:String(RUN_ID),trials:N,no_interim_selection:true,no_record_replacement:true,first_measured_check_includes_lease_establishment_if_needed:true,platform_overhead_status:'UNKNOWN_NOT_ZERO',raw_lease_emitted:false,raw_response_bodies_retained:false,records};
const out={...core,evidence_fingerprint:sha256(core)};writeFileSync(OUT,`${JSON.stringify(out,null,2)}\n`,{flag:'wx'});console.log(JSON.stringify({schema:out.schema,caller_environment:ENV_LABEL,target_preview_sha:TARGET_SHA,trials:N,evidence_fingerprint:out.evidence_fingerprint,raw_lease_emitted:false,production_authorized:false,economic_claim_authorized:false},null,2));
