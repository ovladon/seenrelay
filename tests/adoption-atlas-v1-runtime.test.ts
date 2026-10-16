import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdoptionAtlasV1 } from '../src/adoption-atlas-v1.js';
import { collectAdoptionDistributionSnapshot } from '../src/adoption-atlas-distribution.js';

test('Adoption Atlas v1 does not turn distribution context into unique-user claims', () => {
  const atlas=buildAdoptionAtlasV1({
    now:'2026-10-16T12:00:00Z',
    hosted:{status:'ok',summary:{}},
    voluntary:{status:'ok',summary:{reports_total:0,reports_7d:0,active_reports:0,use_reports:0},cells:[]},
    distribution:{status:'ok',snapshot:{
      collected_at:'2026-10-16T10:00:00Z',
      checked_surfaces:7,
      healthy_surfaces:7,
      npm_downloads_7d:25,
      mcpfield_installs:81,
      github_stars:3,
      github_forks:1
    }}
  });
  assert.equal(atlas.confidence,'EMERGING');
  assert.equal(atlas.adoption_evidence_score,0);
  assert.ok(atlas.reach_context_score>0);
  assert.equal(atlas.claim_boundary.unique_users,'UNKNOWN');
  assert.equal(atlas.claim_boundary.unique_companies,'UNKNOWN');
  assert.equal(atlas.claim_boundary.distribution_metrics_are_adoption,false);
});

test('Adoption Atlas requires direct quality plus corroboration for CONFIRMED', () => {
  const atlas=buildAdoptionAtlasV1({
    now:'2026-10-16T12:00:00Z',
    hosted:{status:'ok',summary:{
      leases_external:1,
      leases_external_repeat:1,
      leases_external_bidirectional:0,
      reuse_external_qualified_cross_client_total:0,
      reuse_external_qualified_consumer_leases:0,
      last_external_activity_at:'2026-10-16T11:00:00Z'
    }},
    voluntary:{status:'ok',summary:{reports_total:1,reports_7d:1,active_reports:0,use_reports:0},cells:[
      {deployment_class:'local',reports:1}
    ]},
    distribution:{status:'empty',snapshot:null}
  });
  assert.equal(atlas.confidence,'CONFIRMED');
  assert.ok(atlas.evidence.direct_hosted.score>0);
  assert.ok(atlas.evidence.voluntary_local.score>0);
});

test('Adoption Atlas STRONG requires multiple retained external leases, qualified reuse, recency and corroboration', () => {
  const atlas=buildAdoptionAtlasV1({
    now:'2026-10-16T12:00:00Z',
    hosted:{status:'ok',summary:{
      leases_external:3,
      leases_external_repeat:2,
      leases_external_bidirectional:1,
      reuse_external_qualified_cross_client_total:2,
      reuse_external_qualified_consumer_leases:1,
      last_external_activity_at:'2026-10-16T11:00:00Z'
    }},
    voluntary:{status:'ok',summary:{reports_total:2,reports_7d:2,active_reports:1,use_reports:1},cells:[
      {deployment_class:'local',reports:1},
      {deployment_class:'private-l1',reports:1}
    ]},
    distribution:{status:'ok',snapshot:{
      collected_at:'2026-10-16T10:00:00Z',
      checked_surfaces:7,
      healthy_surfaces:6,
      npm_downloads_7d:20,
      mcpfield_installs:81,
      github_stars:2,
      github_forks:1
    }}
  });
  assert.equal(atlas.confidence,'STRONG');
  assert.equal(atlas.claim_boundary.hosted_leases_are_unique_actors,false);
  assert.equal(atlas.claim_boundary.hidden_client_telemetry,false);
});

test('daily distribution collector records only aggregate/public signals', async () => {
  const responses=new Map<string,Response>([
    ['https://api.npmjs.org/downloads/point/last-week/seenrelay',new Response(JSON.stringify({downloads:42}),{status:200,headers:{'content-type':'application/json'}})],
    ['https://api.github.com/repos/ovladon/seenrelay',new Response(JSON.stringify({full_name:'ovladon/seenrelay',stargazers_count:5,forks_count:2}),{status:200,headers:{'content-type':'application/json'}})],
    ['https://mcpfield.com/en/skills/seenrelay',new Response('<html>SeenRelay <b>81 installs</b></html>',{status:200})],
    ['https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ovladon%2Fseenrelay',new Response(JSON.stringify({servers:[{name:'io.github.ovladon/seenrelay'}]}),{status:200,headers:{'content-type':'application/json'}})],
    ['https://glama.ai/mcp/connectors?query=SeenRelay',new Response('<html>SeenRelay</html>',{status:200})],
    ['https://agent-plugins.directory/ovladon/seenrelay',new Response('<html>SeenRelay</html>',{status:200})],
    ['https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json',new Response(JSON.stringify({plugins:[{name:'seenrelay',source:'https://github.com/ovladon/seenrelay'}]}),{status:200,headers:{'content-type':'application/json'}})]
  ]);
  const fakeFetch=async (input:RequestInfo|URL)=>{
    const url=String(input);
    const response=responses.get(url);
    if(!response) throw new Error('unexpected '+url);
    return response.clone();
  };
  const snapshot=await collectAdoptionDistributionSnapshot(fakeFetch as typeof fetch);
  assert.equal(snapshot.checked_surfaces,7);
  assert.equal(snapshot.healthy_surfaces,7);
  assert.equal(snapshot.npm_downloads_7d,42);
  assert.equal(snapshot.github_stars,5);
  assert.equal(snapshot.github_forks,2);
  assert.equal(snapshot.mcpfield_installs,81);
  assert.equal(Object.hasOwn(snapshot,'actor_id'),false);
  assert.equal(Object.hasOwn(snapshot,'ip'),false);
  assert.equal(Object.hasOwn(snapshot,'customer_identity'),false);
});
