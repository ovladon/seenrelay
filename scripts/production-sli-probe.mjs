import fs from 'node:fs/promises';

const origin=new URL(process.env.SEENRELAY_SLI_ORIGIN||'https://seenrelay.com');
if(origin.origin!=='https://seenrelay.com') throw new Error('Production SLI probe is pinned to https://seenrelay.com');
const samples=Number.parseInt(process.env.SEENRELAY_SLI_CHECK_SAMPLES||'25',10);
if(!Number.isInteger(samples)||samples<10||samples>50) throw new Error('SEENRELAY_SLI_CHECK_SAMPLES must be 10..50');
const p99Limit=Number(process.env.SEENRELAY_SLI_CHECK_P99_MS||'2000');
if(!Number.isFinite(p99Limit)||p99Limit<=0) throw new Error('SEENRELAY_SLI_CHECK_P99_MS must be positive');
const runKey=`${process.env.GITHUB_RUN_ID||Date.now()}-${process.env.GITHUB_RUN_ATTEMPT||'1'}`;
const fact={
  subject:'SeenRelay production SLI CHECK probe',
  predicate:'latency.probe',
  source:`https://seenrelay.com/benchmarks/sli?seenrelay_internal_benchmark=production-sli-${encodeURIComponent(runKey)}`,
  locator:{scheme:'source_key',value:`production-sli-${runKey}`}
};

function percentile(values,p){
  const sorted=[...values].sort((a,b)=>a-b);
  if(!sorted.length) return null;
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return Number(sorted[index].toFixed(3));
}
function stats(values){
  return {
    samples:values.length,
    p50_ms:percentile(values,50),
    p95_ms:percentile(values,95),
    p99_ms:percentile(values,99),
    max_ms:values.length?Number(Math.max(...values).toFixed(3)):null
  };
}
async function timedFetch(url,init={}){
  const started=performance.now();
  try{
    const response=await fetch(url,{...init,signal:AbortSignal.timeout(10_000)});
    const latency=performance.now()-started;
    const text=await response.text();
    let body=null;
    try{body=text?JSON.parse(text):null;}catch{}
    return {ok:response.ok,status:response.status,latency,body,headers:response.headers};
  }catch(error){
    return {ok:false,status:0,latency:performance.now()-started,body:null,error:error instanceof Error?error.message:'unknown',headers:new Headers()};
  }
}

const health=[];
for(let i=0;i<3;i++) health.push(await timedFetch(new URL('/healthz',origin)));
const service=[];
for(let i=0;i<3;i++) service.push(await timedFetch(new URL('/service.json',origin)));

let lease='';
const checks=[];
for(let i=0;i<samples;i++){
  const headers=new Headers({'content-type':'application/json','x-seenrelay-client':`seenrelay-internal-production-sli-${runKey}`});
  if(lease) headers.set('x-seenrelay-lease',lease);
  const result=await timedFetch(new URL('/v1/check',origin),{
    method:'POST',headers,body:JSON.stringify({fact,known_value:1,max_age_seconds:60})
  });
  lease=result.headers.get('x-seenrelay-lease')||lease;
  checks.push(result);
}

const healthOk=health.filter(x=>x.ok&&x.body?.ok===true&&x.body?.environment==='production').length;
const serviceOk=service.filter(x=>x.ok&&x.body?.service==='SeenRelay').length;
const checkOk=checks.filter(x=>x.ok&&x.body?.status==='UNKNOWN').length;
const checkLatencies=checks.filter(x=>x.ok&&x.body?.status==='UNKNOWN').map(x=>x.latency);
const checkStats=stats(checkLatencies);
const availability={
  health_success_fraction:healthOk/health.length,
  service_success_fraction:serviceOk/service.length,
  check_success_fraction:checkOk/checks.length
};
const objectives={
  synthetic_success_fraction_min:1,
  check_p99_ms_max:p99Limit
};
const breaches=[];
for(const [name,value] of Object.entries(availability)){
  if(value<objectives.synthetic_success_fraction_min) breaches.push(`${name}=${value.toFixed(4)}`);
}
if(checkStats.p99_ms===null||checkStats.p99_ms>p99Limit) breaches.push(`check_p99_ms=${checkStats.p99_ms??'missing'}>${p99Limit}`);
const report={
  schema_version:'seenrelay-production-sli-v1',
  generated_at:new Date().toISOString(),
  first_party:true,
  external_adoption_evidence:false,
  workload_class:'synthetic_internal_sli',
  samples:{health:health.length,service:service.length,check:checks.length},
  availability,
  check_latency:checkStats,
  objectives,
  slo_ok:breaches.length===0,
  breaches,
  caveat:'Synthetic production SLI probe. It measures SeenRelay availability/tail latency from GitHub Actions, not end-user geography or a contractual SLA.'
};
await fs.writeFile('production-sli-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({event:'production_sli',...report}));
