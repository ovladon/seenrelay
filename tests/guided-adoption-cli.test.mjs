import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildGuidedAdoption } from '../clients/typescript/scripts/guided-adoption-lib.mjs';

function fixture(body){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sr-guide-'));
  fs.mkdirSync(path.join(root,'jobs'),{recursive:true});
  fs.writeFileSync(path.join(root,'jobs','daily-search.ts'),body);
  return root;
}

test('guided adoption composes scan and plan without mutation authority',async()=>{
  const root=fixture(`
    import { tavily } from '@tavily/core';
    const client=tavily({apiKey:process.env.TAVILY_API_KEY});
    export async function scheduled(){ return client.search("latest agent infrastructure releases"); }
  `);
  const before=fs.readFileSync(path.join(root,'jobs','daily-search.ts'),'utf8');
  const x=await buildGuidedAdoption(root);
  const after=fs.readFileSync(path.join(root,'jobs','daily-search.ts'),'utf8');
  assert.equal(after,before);
  assert.equal(x.schema_version,'seenrelay-guided-adoption-v1');
  assert.equal(x.scan.schema_version,'seenrelay-static-prescreen-v1');
  assert.equal(x.plan.schema_version,'seenrelay-adoption-plan-v1');
  assert.equal(x.authority.modifies_project,false);
  assert.equal(x.authority.contacts_seenrelay,false);
  assert.equal(x.authority.uploads_source,false);
  assert.equal(x.authority.enables_reuse,false);
  assert.equal(x.authority.can_return_use_verdict,false);
  assert.equal(x.state,'PRESCREEN');
  assert.equal(x.decision,'INSTRUMENT_SHADOW_ONLY');
  assert.equal(x.next_action.route_id,'generic_execution_boundary');
  assert.equal(x.next_action.trust,'https://seenrelay.com/trust.json');
  assert.equal(x.next_action.agent_adoption,'https://seenrelay.com/agent-adoption.json');
  assert.match(x.disclaimer,/does not authorize code changes, active reuse, suppression, or a SeenRelay USE verdict/i);
});

test('guide preserves native-first self-rejection',async()=>{
  const root=fixture(`
    import { TavilyClient } from 'tavily';
    const redis=createRedis();
    export async function scheduled(){
      const cached=await redis.get('daily-query');
      return cached ?? new TavilyClient().search("latest AI news");
    }
  `);
  const x=await buildGuidedAdoption(root);
  assert.equal(x.scan.overall_status,'NATIVE_CONTROL_FIRST');
  assert.equal(x.decision,'MEASURE_NATIVE_FIRST');
  assert.equal(x.plan.install_policy,'DEFER_SEENRELAY_PROTECTION');
});

test('packaged CLI exposes guide and returns machine JSON',()=>{
  const root=fixture(`
    import Exa from 'exa-js';
    export async function search(q){ return new Exa(process.env.EXA_API_KEY).search(q); }
  `);
  const cli=new URL('../clients/typescript/scripts/seenrelay-cli.mjs',import.meta.url);
  const r=spawnSync(process.execPath,[cli.pathname,'guide',root,'--json'],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const x=JSON.parse(r.stdout);
  assert.equal(x.schema_version,'seenrelay-guided-adoption-v1');
  assert.equal(x.scan.overall_status,'CANDIDATE_FOR_SHADOW_MEASUREMENT');
  assert.equal(x.decision,'INSTRUMENT_SHADOW_ONLY');
  assert.equal(x.authority.modifies_project,false);
});
