import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  SeenRelayFleetCoordinator, InMemoryFleetCoordinationStore,
  fleetCodecFromPrivateCodec
} from '../clients/typescript/dist/fleet.js';
import {createAesGcmPrivateCodec} from '../clients/typescript/dist/zero-state.js';

const h=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const policy={
  sideEffectClass:'read_only',
  exactSingleAnswerShareable:true,
  independentSamplesRequired:false
};
function singleflight(){
  const pending=new Map();
  return (key,work)=>{
    if(!pending.has(key)){
      const promise=Promise.resolve().then(work);
      pending.set(key,promise);
      promise.finally(()=>{if(pending.get(key)===promise)pending.delete(key)});
    }
    return pending.get(key);
  };
}
async function source(){
  let state='api-doc-version-1';
  let reads=0;
  const server=createServer(async(req,res)=>{
    if(req.url!=='/docs'){res.writeHead(404).end();return;}
    reads++;
    await sleep(25);
    const etag='"'+h(state)+'"';
    if(req.headers['if-none-match']===etag){
      res.writeHead(304,{etag});res.end();return;
    }
    res.writeHead(200,{'content-type':'text/plain',etag});
    res.end(state);
  });
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  return {
    url:'http://127.0.0.1:'+server.address().port+'/docs',
    set:s=>{state=s},
    version:()=>h(state), reads:()=>reads,
    close:()=>new Promise(ok=>server.close(ok))
  };
}
async function authoritative(endpoint){
  const r=await fetch(endpoint.url);
  assert.equal(r.status,200);
  return {content:await r.text(),sourceVersion:r.headers.get('etag')};
}
function coordinate(endpoint,codeDigest){
  return {
    tenantScope:'isolated-tenant-a',verifiedSourceVersion:endpoint.version(),
    operation:'read-only-api-doc-extraction-v1',
    codeDigest,readerOptions:'same-semantic-document',
    resultRepresentation:'plain-text-v1'
  };
}
const roles=['coding-agent-1','coding-agent-2','review-agent-1','review-agent-2'];
const toolTypes=['docs-client-a','browser-client-b','docs-client-a','browser-client-b'];
async function runArm(arm,endpoint,steps){
  const sfByTool=new Map();
  const shared=singleflight();
  const store=new InMemoryFleetCoordinationStore();
  const codec=fleetCodecFromPrivateCodec(createAesGcmPrivateCodec(randomBytes(32)));
  const coordinators=roles.map(()=>new SeenRelayFleetCoordinator({
    store,codec,scopeKey:'isolated-tenant-a',pollMs:2
  }));
  const before=endpoint.reads(),begin=performance.now();
  let correctlyChecked=0,followers=0;
  for(const [index,step] of steps.entries()){
    endpoint.set(step.source);
    const coord=coordinate(endpoint,h(step.relevantCode));
    const key=JSON.stringify(coord);
    const results=await Promise.all(roles.map(async(_,i)=>{
      const perform=()=>authoritative(endpoint);
      if(arm==='uncoordinated')return perform();
      if(arm==='tool-local'){
        const tool=toolTypes[i];
        if(!sfByTool.has(tool))sfByTool.set(tool,singleflight());
        return sfByTool.get(tool)(key,perform);
      }
      if(arm==='strong-native-shared')return shared(key,perform);
      if(arm==='seenrelay-fleet')return coordinators[i].run({
        coordinate:coord,policy,execute:perform
      });
      throw new Error('Unknown arm '+arm);
    }));
    assert.equal(results.length,4);
    for(const result of results){
      assert.equal(result.content,step.source);
      assert.equal(result.sourceVersion,'"'+h(step.source)+'"');
      correctlyChecked++;
    }
    if(index>0 && steps[index-1].source!==step.source) {
      assert.notEqual(results[0].sourceVersion,'"'+h(steps[index-1].source)+'"');
    }
  }
  followers=coordinators.reduce((n,c)=>n+c.getTelemetry().followerReuses,0);
  return {
    arm,phases:steps.length,agents:roles.length,logicalReads:correctlyChecked,
    authoritativeHttpReads:endpoint.reads()-before,
    followers,elapsedMs:Math.round((performance.now()-begin)*100)/100
  };
}
test('real HTTP across heterogeneous agent tool labels: compare native and SeenRelay on exact state versions',async()=>{
  const endpoints=await Promise.all(Array.from({length:4},()=>source()));
  const steps=[
    {source:'api-doc-version-1',relevantCode:'source-code-v1',note:'commit A'},
    {source:'api-doc-version-1',relevantCode:'source-code-v1',note:'unrelated doc changed'},
    {source:'api-doc-version-1',relevantCode:'source-code-v2',note:'relevant code changed'},
    {source:'api-doc-version-2',relevantCode:'source-code-v2',note:'upstream docs changed'},
    {source:'api-doc-version-2',relevantCode:'source-code-v1',note:'code reverted'}
  ];
  try{
    const arms=['uncoordinated','tool-local','strong-native-shared','seenrelay-fleet'];
    const results=[];
    for(let i=0;i<arms.length;i++)results.push(await runArm(arms[i],endpoints[i],steps));
    const counts=Object.fromEntries(results.map(x=>[x.arm,x.authoritativeHttpReads]));
    assert.deepEqual(counts,{
      'uncoordinated':20,'tool-local':10,'strong-native-shared':5,'seenrelay-fleet':5
    });
    assert.equal(results.at(-1).followers,15);
    assert.equal(results.at(-1).logicalReads,20);
    console.log('AGENT_DELTA_REAL_HTTP_COMPARATOR '+JSON.stringify({
      evidence_class:'CONTROLLED_REAL_LOCAL_HTTP_NOT_EXTERNAL_PAID_TRAFFIC',
      scenarios:steps.map(x=>x.note),
      results,incremental_http_reads_avoided_vs_best_native:
        counts['strong-native-shared']-counts['seenrelay-fleet'],
      realized_billed_customer_savings_usd:null
    }));
  }finally{await Promise.all(endpoints.map(e=>e.close()))}
});
