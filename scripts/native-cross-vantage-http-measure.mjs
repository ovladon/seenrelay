import assert from 'node:assert/strict';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const BASE = process.env.SEENRELAY_PREVIEW_BASE;
const TARGET_SHA = process.env.TARGET_PREVIEW_SHA;
const LAB_AUTH = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const VANTAGE = process.env.VANTAGE_LABEL;
const OUT = process.env.MEASUREMENT_OUTPUT;
const RUN_ID = process.env.GITHUB_RUN_ID;
const TARGET = BASE ? new URL(`${BASE}/api/resource`) : null;
const TRIALS = 60;

if (!BASE || !TARGET_SHA || !LAB_AUTH || !VANTAGE || !OUT || !RUN_ID) throw new Error('required environment is missing');
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const opaque = (etag) => String(etag || '').replace(/^W\//, '');

function timing(raw) {
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

function requestBytes(method, headers) {
  let n = Buffer.byteLength(`${method} ${TARGET.pathname} HTTP/1.1\r\n`);
  for (const [k,v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'x-vercel-protection-bypass') continue;
    n += Buffer.byteLength(`${k}: ${v}\r\n`);
  }
  return n + 2;
}

function responseHeaderBytes(res) {
  let n = Buffer.byteLength(`HTTP/${res.httpVersion} ${res.statusCode} ${res.statusMessage || ''}\r\n`);
  for (let i=0;i<res.rawHeaders.length;i+=2) n += Buffer.byteLength(`${res.rawHeaders[i]}: ${res.rawHeaders[i+1]}\r\n`);
  return n + 2;
}

function requestOnce(method='GET', headers={}) {
  const all = {...headers, 'x-vercel-protection-bypass':LAB_AUTH};
  const reqBytes = requestBytes(method, all);
  const wall = process.hrtime.bigint();
  const cpu = process.cpuUsage();
  return new Promise((resolve,reject) => {
    const req = https.request(TARGET,{method,headers:all,agent:false},(res) => {
      const chunks=[];
      let bodyBytes=0;
      res.on('data',(chunk) => { bodyBytes += chunk.length; if (bodyBytes>1024*1024) req.destroy(new Error('body too large')); else chunks.push(chunk); });
      res.on('end',() => {
        const body=Buffer.concat(chunks);
        const headersOut={};
        for (const [k,v] of Object.entries(res.headers)) headersOut[k.toLowerCase()] = Array.isArray(v)?v.join(', '):String(v??'');
        const st=timing(headersOut['server-timing']);
        assert.ok(Number.isFinite(st.get('cpu')) && Number.isFinite(st.get('app')), 'Server-Timing cpu/app missing');
        const used=process.cpuUsage(cpu);
        resolve({
          status:res.statusCode,
          headers:headersOut,
          body,
          metrics:{
            agent_cpu_ms:(used.user+used.system)/1000,
            agent_elapsed_ms:Number(process.hrtime.bigint()-wall)/1e6,
            destination_cpu_ms:st.get('cpu'),
            destination_app_elapsed_ms:st.get('app'),
            agent_requests:1,
            normalized_http_application_bytes:reqBytes+responseHeaderBytes(res)+body.length
          }
        });
      });
    });
    req.setTimeout(15000,()=>req.destroy(new Error('request timeout')));
    req.on('error',reject);
    req.end();
  });
}

function check200(r, kind) {
  assert.equal(r.status,200);
  assert.equal(r.headers['x-seenrelay-fixture-commit'],TARGET_SHA);
  assert.equal(r.headers['x-seenrelay-fixture-revision'],'preview-http-fixture-v1');
  assert.ok(r.headers.etag);
  if (kind==='json') assert.equal(JSON.parse(r.body.toString()).version,1);
  else assert.equal(r.body.toString(),'version=1\n');
}
function checkHead(r,etag) { assert.equal(r.status,200); assert.equal(r.body.length,0); assert.equal(opaque(r.headers.etag),opaque(etag)); }
function check304(r,etag) { assert.equal(r.status,304); assert.equal(r.body.length,0); assert.equal(opaque(r.headers.etag),opaque(etag)); }

async function path(pathId,etag) {
  let r;
  if (pathId==='authoritative_json_get') { r=await requestOnce('GET',{accept:'application/json'}); check200(r,'json'); }
  else if (pathId==='compact_text_get') { r=await requestOnce('GET',{accept:'text/plain'}); check200(r,'text'); }
  else if (pathId==='head_compact_validator') { r=await requestOnce('HEAD',{accept:'text/plain'}); checkHead(r,etag); }
  else if (pathId==='conditional_get_304_compact') { r=await requestOnce('GET',{accept:'text/plain','if-none-match':etag}); check304(r,etag); }
  else if (pathId==='conditional_head_304_compact') { r=await requestOnce('HEAD',{accept:'text/plain','if-none-match':etag}); check304(r,etag); }
  else throw new Error(`unknown path ${pathId}`);
  return {path_id:pathId,status:r.status,metrics:r.metrics};
}

const seed=await requestOnce('GET',{accept:'text/plain'});
check200(seed,'text');
const etag=seed.headers.etag;
const first=['authoritative_json_get','compact_text_get'];
const sub=['authoritative_json_get','compact_text_get','head_compact_validator','conditional_get_304_compact','conditional_head_304_compact'];
const evidence={
  schema:'seenrelay-preview-native-cross-vantage-http-v1', target_preview_sha:TARGET_SHA,
  target_resource_revision:'preview-http-fixture-v1', sample_type:'controlled_real_service', vantage_label:VANTAGE,
  run_coordinate:{github_run_id:RUN_ID,github_run_attempt:process.env.GITHUB_RUN_ATTEMPT||null},
  retained_validator:{fingerprint:sha256(etag),strength:String(etag).startsWith('W/')?'weak':'strong'},
  trial_contract:{trials:TRIALS,no_interim_selection:true}, measurements:{first_contact:[],subsequent_contact:[]},
  privacy:{raw_auth_material_emitted:false,raw_response_bodies_retained:false}
};

for (let i=0;i<TRIALS;i++) {
  const trial_id=`first-${String(i+1).padStart(3,'0')}`;
  const order=i%2===0?first:[...first].reverse();
  for (let position=0;position<order.length;position++) evidence.measurements.first_contact.push({trial_id,position,...await path(order[position],etag)});
}
for (let i=0;i<TRIALS;i++) {
  const trial_id=`sub-${String(i+1).padStart(3,'0')}`;
  const shift=i%sub.length;
  const order=[...sub.slice(shift),...sub.slice(0,shift)];
  for (let position=0;position<order.length;position++) evidence.measurements.subsequent_contact.push({trial_id,position,...await path(order[position],etag)});
}
const post=await requestOnce('GET',{accept:'text/plain'}); check200(post,'text');
evidence.summary={first_records:evidence.measurements.first_contact.length,subsequent_records:evidence.measurements.subsequent_contact.length,all_measurements_completed:true};
evidence.evidence_fingerprint=sha256(JSON.stringify(evidence));
writeFileSync(OUT,`${JSON.stringify(evidence,null,2)}\n`,{flag:'wx'});
console.log(JSON.stringify({schema:evidence.schema,vantage_label:VANTAGE,trials:TRIALS,evidence_fingerprint:evidence.evidence_fingerprint,output:OUT},null,2));
