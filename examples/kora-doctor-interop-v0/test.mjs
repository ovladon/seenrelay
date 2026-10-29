import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { analyze } from './classify.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const records=readFileSync(path.join(here,'fixture.audr.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const expected=JSON.parse(readFileSync(path.join(here,'expected.json'),'utf8')).cases;
test('AUDR-shaped records contain only opaque synthetic fingerprints',()=>{
  assert.equal(records.length,expected.length*2);
  for(const r of records){
    for(const f of ['spec_version','record_id','timing','resource','run','attribution','usage','emitter'])assert.ok(r[f]);
    assert.equal(r.spec_version,'1.0.0');assert.equal(r.resource.type,'tool');
    assert.equal(r.record_id.length,26);
    assert.match(r.attribution.labels.tool_args_hash,/^sha256:[a-f0-9]{64}$/);
    assert.match(r.attribution.labels.tool_result_hash,/^sha256:[a-f0-9]{64}$/);
    for(const forbidden of ['prompt','raw_args','raw_result','body','payload','access_token','api_key'])
      assert.equal(JSON.stringify(r).includes('"'+forbidden+'"'),false);
  }
});
test('all synthetic cases have exactly the expected conservative verdict',()=>{
 const got=new Map(analyze(records).map(x=>[x.run_id,x]));
 assert.equal(got.size,expected.length);
 for(const c of expected){
   assert.equal(got.get(c.run_id)?.status,c.expected,c.case);
   assert.deepEqual([got.get(c.run_id).first_record_id,got.get(c.run_id).second_record_id],c.record_ids);
 }
});
test('zero skipped executions and zero verified financial-savings claims',()=>{
 for(const v of analyze(records)){assert.equal(v.auto_reuse_authorized,false);assert.equal(v.verified_saved_usd,null)}
});
test('missing source identity is insufficient even if args and output match',()=>{
 const p=structuredClone(records[0]),q=structuredClone(records[1]);
 delete q.attribution.labels['sr.source_version_hash'];
 assert.equal(analyze([p,q])[0].status,'INSUFFICIENT_EVIDENCE');
});
test('different scope is explicitly rejected despite identical hashes',()=>{
 const p=structuredClone(records[0]),q=structuredClone(records[1]);
 q.attribution.labels['sr.tenant_hmac']='sha256:'+'f'.repeat(64);
 assert.equal(analyze([p,q])[0].status,'REJECT_SCOPE');
});
