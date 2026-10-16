import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAdoptionReportPayload, adoptionReportPrivacyBoundary, shareAdoptionReport } from '../clients/typescript/scripts/adoption-report-lib.mjs';

test('adoption report payload is a closed coarse schema', () => {
  const payload=buildAdoptionReportPayload({
    integrationClass:'mcp',
    deploymentClass:'local',
    mode:'shadow',
    decision:'INSUFFICIENT',
    workloadClass:'mcp-tools'
  },'0.2.28');
  assert.deepEqual(Object.keys(payload).sort(),[
    'decision','deployment_class','integration_class','mode','schema_version','seenrelay_version','workload_class'
  ]);
  for (const forbidden of ['prompt','response','source_url','fact','value','repository','filename','customer_identity','actor_id','ip','user_agent']) {
    assert.equal(Object.hasOwn(payload,forbidden),false,forbidden);
  }
});

test('adoption report is local by default and share sends only the closed JSON payload', async () => {
  const boundary=adoptionReportPrivacyBoundary();
  assert.equal(boundary.default_network_contact,false);
  assert.equal(boundary.share_requires_explicit_flag,true);
  assert.equal(boundary.unique_actor_claim,false);

  const payload=buildAdoptionReportPayload({
    integrationClass:'sdk',
    deploymentClass:'private-l1',
    mode:'active',
    decision:'USE',
    workloadClass:'api-validation'
  },'0.2.28');
  let captured=null;
  const fetchImpl=async (url,options)=>{
    captured={url,options};
    return {ok:true,status:202,async json(){return {accepted:true};}};
  };
  const receipt=await shareAdoptionReport(payload,{fetchImpl,endpoint:'https://example.invalid/v1/adoption-report'});
  assert.equal(receipt.accepted,true);
  assert.equal(captured.url,'https://example.invalid/v1/adoption-report');
  assert.deepEqual(JSON.parse(captured.options.body),payload);
  assert.deepEqual(captured.options.headers,{'content-type':'application/json'});
});

test('Adoption Atlas persistence is aggregate-only and does not create identity columns', () => {
  const migration=fs.readFileSync(new URL('../migrations/0008_adoption_atlas.sql',import.meta.url),'utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS adoption_atlas_daily/);
  assert.match(migration,/PRIMARY KEY \(day, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class\)/);
  assert.doesNotMatch(migration,/\b(ip|user_agent|actor_id|client_id|customer_id|repo|filename|prompt|response|source_url|fact_key|value_hash)\b\s+(text|uuid|jsonb)/i);
  const db=fs.readFileSync(new URL('../src/adoption-atlas-db.ts',import.meta.url),'utf8');
  assert.match(db,/ON CONFLICT \(day, seenrelay_version, integration_class, deployment_class, mode, decision, workload_class\)/);
  assert.doesNotMatch(db,/randomUUID|privacyScopedHash|deriveClientKey/);
});

test('public adoption-report route is bounded and admin labels Atlas as unverified aggregate signal', () => {
  const index=fs.readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
  const start=index.indexOf("app.post('/v1/adoption-report'");
  assert.notEqual(start,-1);
  const end=index.indexOf('\napp.',start+1);
  const route=index.slice(start,end);
  assert.match(route,/boundedRequest\(c\.req\.raw, 2048\)/);
  assert.match(route,/readJsonBody<unknown>\(bounded\.request, 2048\)/);

  const adminDb=fs.readFileSync(new URL('../src/adoption-atlas-db.ts',import.meta.url),'utf8');
  assert.match(adminDb,/reports_are_unique_actors: false/);
  assert.match(adminDb,/deduplicated: false/);
  assert.match(adminDb,/identity_stored: false/);
});
