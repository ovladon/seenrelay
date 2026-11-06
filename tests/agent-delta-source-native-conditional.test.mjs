import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import {SeenRelayFleetCoordinator,InMemoryFleetCoordinationStore,fleetCodecFromPrivateCodec} from '../clients/typescript/dist/fleet.js';
import {createAesGcmPrivateCodec} from '../clients/typescript/dist/zero-state.js';

const sha=s=>createHash('sha256').update(s).digest('hex');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const policy={sideEffectClass:'read_only',exactSingleAnswerShareable:true,independentSamplesRequired:false};
function singleflight(){
  const pending=new Map();
  return (key,fn)=>{
    if(!pending.has(key)){
      const task=Promise.resolve().then(fn);
      pending.set(key,task);
      task.finally(()=>{if(pending.get(key)===task)pending.delete(key)});
    }
    return pending.get(key);
  };
}
async function server(){
  let source='public-doc-v1';
  let get200=0,get304=0,head=0;
  const srv=createServer(async(req,res)=>{
    if(req.url!=='/external-doc'){res.writeHead(404);res.end();return}
    await wait(10);
    const etag='"'+sha(source)+'"';
    if(req.method==='HEAD'){
      head++;res.writeHead(200,{etag});res.end();return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return}
    if(req.headers['if-none-match']===etag){
      get304++;res.writeHead(304,{etag});res.end();return
    }
    get200++;res.writeHead(200,{etag,'content-type':'text/plain'});res.end(source)
  });
  await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
  return {
    url:'http://127.0.0.1:'+srv.address().port+'/external-doc',
    set:s=>{source=s},
    stats:()=>({http_get_200:get200,http_get_304:get304,http_head:head,
      total_http_requests:get200+get304+head}),
    close:()=>new Promise(resolve=>srv.close(resolve))
  }
}
async function validator(url,state){
  const headers=state.etag?{'if-none-match':state.etag}:{};
  const r=await fetch(url,{headers});
  if(r.status===304){
    if(!state.value)throw Error('304 without artifact');
    return state.value;
  }
  assert.equal(r.status,200);
  const result={content:await r.text(),etag:r.headers.get('etag')};
  state.value=result;state.etag=result.etag;return result;
}
async function experiment(arm){
  const srv=await server();
  const steps=[
    {source:'public-doc-v1',code:'A',note:'initial'},
    {source:'public-doc-v1',code:'A',note:'unrelated code'},
    {source:'public-doc-v1',code:'B',note:'relevant code'},
    {source:'public-doc-v2',code:'B',note:'changed external source'},
    {source:'public-doc-v2',code:'A',note:'reverted code'}
  ];
  const native=new Map(),shared={etag:null,value:null},locks=singleflight();
  const localLocks=[singleflight(),singleflight()];
  const store=new InMemoryFleetCoordinationStore();
  const codec=fleetCodecFromPrivateCodec(createAesGcmPrivateCodec(randomBytes(32)));
  const fleet=Array.from({length:4},()=>new SeenRelayFleetCoordinator({
    store,codec,scopeKey:'source-native-comparator',pollMs:2
  }));
  let mismatch=0;let validated=0;
  try{
    for(const step of steps){
      srv.set(step.source);
      let knownEtag;
      if(arm==='seenrelay-fleet'){
        const probe=await fetch(srv.url,{method:'HEAD'});
        assert.equal(probe.status,200);
        knownEtag=probe.headers.get('etag');
      }
      const results=await Promise.all(Array.from({length:4},(_,i)=>{
        const tool=i%2;
        if(arm==='uncoordinated')return validator(srv.url,{etag:null,value:null});
        if(arm==='tool-native'){
          if(!native.has(tool))native.set(tool,{etag:null,value:null});
          return localLocks[tool]('read',()=>validator(srv.url,native.get(tool)));
        }
        if(arm==='strong-native-shared'){
          return locks('read',()=>validator(srv.url,shared));
        }
        if(arm==='seenrelay-fleet'){
          return fleet[i].run({
            coordinate:{
              scope:'same-user',fact:'external-doc',version:knownEtag,
              operation:'external-document-read',options:'full-text-v1'
            },
            policy,
            execute:()=>validator(srv.url,{etag:null,value:null})
          })
        }
        throw Error('unknown arm');
      }));
      for(const r of results){validated++;if(r.content!==step.source)mismatch++;}
    }
    const stats=srv.stats();
    const followers=fleet.reduce((n,c)=>n+c.getTelemetry().followerReuses,0);
    return {arm,stages:5,logical_results:validated,semantic_mismatches:mismatch,...stats,followers};
  }finally{await srv.close()}
}
test('live conditional HTTP version costs: strong source-native cache vs active SeenRelay fleet',async()=>{
  const arms=['uncoordinated','tool-native','strong-native-shared','seenrelay-fleet'];
  const r=[];
  for(const arm of arms)r.push(await experiment(arm));
  const by=Object.fromEntries(r.map(x=>[x.arm,x]));
  assert.deepEqual(r.map(x=>x.semantic_mismatches),[0,0,0,0]);
  assert.deepEqual(r.map(x=>x.logical_results),[20,20,20,20]);
  assert.equal(by.uncoordinated.http_get_200,20);
  assert.equal(by['tool-native'].total_http_requests,10);
  assert.equal(by['strong-native-shared'].total_http_requests,5);
  assert.equal(by['strong-native-shared'].http_get_200,2);
  assert.equal(by['strong-native-shared'].http_get_304,3);
  assert.equal(by['seenrelay-fleet'].http_head,5);
  assert.equal(by['seenrelay-fleet'].http_get_200,5);
  assert.equal(by['seenrelay-fleet'].total_http_requests,10);
  assert.equal(by['seenrelay-fleet'].followers,15);
  console.log('AGENT_DELTA_SOURCE_NATIVE_HTTP '+JSON.stringify({
    evidence_class:'CONTROLLED_LOCAL_HTTP_NO_REAL_PROVIDER_BILLING',
    source_native_comparator_enforces_freshness_with_conditional_get:true,
    result:r,
    seenrelay_active_net_request_advantage_vs_best_source_native:
      by['strong-native-shared'].total_http_requests-by['seenrelay-fleet'].total_http_requests,
    paid_external_savings_usd:null,model_context_savings_usd:null
  }));
});
