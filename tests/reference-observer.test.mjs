import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OBSERVER_ID, SOURCES, buildObservePayload, jsonPointer, sourceDue } from '../scripts/reference-observer.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.join(here,'..');
const read=(...parts)=>fs.readFileSync(path.join(root,...parts),'utf8');

test('reference observer uses one first-party identity and only allowlisted HTTPS JSON sources',()=>{
  assert.equal(OBSERVER_ID,'seenrelay-reference-observer-v1');
  assert.ok(SOURCES.length >= 5 && SOURCES.length <= 25);
  assert.equal(new Set(SOURCES.map(x=>x.id)).size,SOURCES.length);
  const allowedHosts=new Set(['www.githubstatus.com','nodejs.org','pypi.org','registry.npmjs.org']);
  for(const source of SOURCES){
    const u=new URL(source.source);
    assert.equal(u.protocol,'https:');
    assert.ok(allowedHosts.has(u.hostname),`unexpected source host ${u.hostname}`);
    assert.equal(source.locator.scheme,'json_pointer');
    assert.ok(source.locator.value.startsWith('/'));
    assert.ok(source.period_minutes>=30 && source.period_minutes%30===0);
  }
});

test('JSON pointer and payload construction preserve deterministic source-backed identity',()=>{
  assert.equal(jsonPointer({a:{b:'v'}},'/a/b'),'v');
  assert.equal(jsonPointer({'a/b':{'~x':2}},'/a~1b/~0x'),2);
  const source={id:'x',subject:'Example',predicate:'version.latest',source:'https://example.com/a.json',locator:{scheme:'json_pointer',value:'/version'},period_minutes:60};
  const now=new Date('2026-08-25T08:00:00Z');
  const body=buildObservePayload(source,{version:'1.2.3'},Buffer.from('{"version":"1.2.3"}'),now);
  assert.equal(body.value,'1.2.3');
  assert.equal(body.observer_id,OBSERVER_ID);
  assert.equal(body.fact.source,source.source);
  assert.equal(body.fact.locator.value,'/version');
  assert.match(body.evidence_fingerprint,/^sha256:[0-9a-f]{64}$/);
  assert.match(body.idempotency_key,/^reference-observer\/x\//);
});

test('period scheduling is bounded to one scheduler window per source interval',()=>{
  const source={id:'six-hour',period_minutes:360};
  assert.equal(sourceDue(source,new Date('2026-08-25T06:07:00Z')),true);
  assert.equal(sourceDue(source,new Date('2026-08-25T06:37:00Z')),false);
  assert.equal(sourceDue(source,new Date('2026-08-25T12:07:00Z')),true);
});

test('reference observer workflow is read-only to GitHub and cannot become a hidden third SeenRelay operation',()=>{
  const workflow=read('.github','workflows','reference-observer.yml');
  const script=read('scripts','reference-observer.mjs');
  assert.match(workflow,/contents:\s*read/);
  assert.doesNotMatch(workflow,/contents:\s*write|issues:\s*write|id-token:\s*write/);
  assert.match(workflow,/node scripts\/reference-observer\.mjs/);
  for (const ref of workflow.matchAll(/uses:\s*actions\/(?:checkout|setup-node)@([^\s#]+)/g)) assert.match(ref[1],/^[0-9a-f]{40}$/);
  assert.match(script,/\/v1\/observe/);
  assert.doesNotMatch(script,/\/v1\/check|\/v1\/verify|search engine|browser automation/i);
  assert.doesNotMatch(script,/process\.env\.(?:API_KEY|TOKEN|SECRET)|secrets\./i);
});

test('one run fetches a shared source once and reuses the returned Hive lease',async()=>{
  const sourceCalls=[];
  const observeCalls=[];
  let firstPost=true;
  const fetchImpl=async(url,options={})=>{
    if(String(url).startsWith('https://www.githubstatus.com/')){
      sourceCalls.push(String(url));
      return new Response(JSON.stringify({status:{indicator:'none',description:'All Systems Operational'}}),{status:200,headers:{'content-type':'application/json','etag':'"status-v1"'}});
    }
    if(String(url)==='https://seenrelay.com/v1/observe'){
      observeCalls.push(options);
      const headers=firstPost?{'content-type':'application/json','x-seenrelay-lease':'lease-one'}:{'content-type':'application/json'};
      firstPost=false;
      return new Response(JSON.stringify({accepted:true,observer_identity:'self_asserted'}),{status:200,headers});
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const { runReferenceObserver } = await import('../scripts/reference-observer.mjs');
  const summary=await runReferenceObserver({fetchImpl,now:new Date('2026-08-25T08:07:00Z'),logger:{log(){},warn(){},error(){}}});
  assert.equal(summary.due,2);
  assert.equal(summary.observed,2);
  assert.equal(sourceCalls.length,1);
  assert.equal(observeCalls.length,2);
  assert.equal(observeCalls[0].headers['x-seenrelay-lease'],undefined);
  assert.equal(observeCalls[1].headers['x-seenrelay-lease'],'lease-one');
});
