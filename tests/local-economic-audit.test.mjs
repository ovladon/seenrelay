import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  identifyLocalAuditInput,
  runLocalEconomicAudit,
  renderLocalEconomicAudit
} from '../clients/typescript/scripts/local-economic-audit-lib.mjs';

test('auto-detection is restricted to supported explicit evidence formats',()=>{
  const receipt={schema:'seenrelay-fleet-savings-receipt-v0',avoidedExecutions:0};
  const trace={schema:'seenrelay-fleet-trace-event-v1'};
  assert.equal(identifyLocalAuditInput(JSON.stringify({schema:'seenrelay-fleet-savings-ledger-v0'})),'savings-ledger');
  assert.equal(identifyLocalAuditInput(JSON.stringify([receipt])),'savings-ledger');
  assert.equal(identifyLocalAuditInput(JSON.stringify([trace])),'fleet-trace');
  assert.equal(identifyLocalAuditInput(JSON.stringify(trace)+'\n'+JSON.stringify(trace)),'fleet-trace');
  assert.equal(identifyLocalAuditInput(JSON.stringify({resourceSpans:[]})),'otlp');
  assert.equal(identifyLocalAuditInput(JSON.stringify([{type:'TOOL',traceId:'t',startTime:'2026-10-09T00:00:00Z'}])),'langfuse');
  assert.throws(()=>identifyLocalAuditInput('not JSON'),/JSON or JSONL/);
  assert.throws(()=>identifyLocalAuditInput(JSON.stringify([{secret:'private',token:'opaque'}])),/unsupported audit format/);
});

test('local economic audit keeps a measured ledger non-commercial',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'seenrelay-local-audit-'));
  try {
    const file=path.join(tmp,'ledger.json');
    await fs.writeFile(file,JSON.stringify({
      schema:'seenrelay-fleet-savings-ledger-v0',
      receipts:0,authoritativeExecutions:1,followerReuses:0,avoidedExecutions:0,
      costedAvoidedExecutions:0,uncostedAvoidedExecutions:0,grossAvoidedCostUsd:0
    }));
    const r=await runLocalEconomicAudit(file,{overheadUsd:0});
    assert.equal(r.kind,'savings-ledger');
    assert.equal(r.status,'NO_AVOIDED_EXECUTIONS');
    assert.equal(r.evidence_boundary.independent_customer_roi_proven,false);
    assert.equal(r.evidence_boundary.may_enable_billing,false);
    assert.equal(r.report.access_and_billing.billing_enabled,false);
    assert.match(renderLocalEconomicAudit(r),/No customer ROI/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});

test('do not silently reinterpret an unsupported file as a zero-savings audit',async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'seenrelay-bad-audit-'));
  try {
    const file=path.join(tmp,'unknown.json');
    await fs.writeFile(file,JSON.stringify({app:'agent',call:'tool',success:true}));
    await assert.rejects(runLocalEconomicAudit(file),/unsupported audit format/);
  } finally { await fs.rm(tmp,{recursive:true,force:true}); }
});

test('first-value meter separates detected opportunity from realized savings',()=>{
  const common={status:'POTENTIAL_REQUIRES_NATIVE_AND_SHADOW_EVIDENCE',next_action:'Measure native controls first.'};
  const project=renderLocalEconomicAudit({...common,kind:'project-prescreen',report:{scan:{candidate_files:3}}});
  assert.match(project,/Candidate files: 3/);
  assert.match(project,/Cost opportunity: not measured/);
  assert.doesNotMatch(project,/Measured net savings:/);

  const fleet=renderLocalEconomicAudit({...common,kind:'fleet-trace',report:{
    successful_leader_overlap_opportunities:4,
    potential_avoided_costed_events:2,
    gross_potential_avoided_cost_usd:1.25
  }});
  assert.match(fleet,/Gross potential on costed opportunities: \\$1\\.250000/);
  assert.match(fleet,/Priced opportunity coverage: 2\\/4/);
  assert.match(fleet,/Actual savings: not measured/);
  assert.match(fleet,/before native\\/local alternatives/);

  const unpriced=renderLocalEconomicAudit({...common,kind:'otlp',report:{
    successful_leader_overlap_opportunities:3,
    potential_avoided_costed_events:0,
    gross_potential_avoided_cost_usd:0
  }});
  assert.match(unpriced,/unknown \\(no priced eligible overlap\\)/);
  assert.doesNotMatch(unpriced,/Gross potential on costed opportunities: \\$0\\.000000/);

  const langfuse=renderLocalEconomicAudit({...common,kind:'langfuse',report:{
    exact_repeat_starts:5,recorded_cost_on_exact_repeat_starts_usd:0.75
  }});
  assert.match(langfuse,/Recorded spend on exact repeat starts: \\$0\\.750000/);
  assert.match(langfuse,/repeat spend is not avoidable spend/);
});

test('first-value meter displays actual saved work but unknown net when overhead is absent',()=>{
  const r=renderLocalEconomicAudit({
    kind:'savings-ledger',
    status:'GROSS_SAVINGS_MEASURED_NET_UNKNOWN',
    next_action:'Compare best native baseline.',
    report:{evidence:{
      actual_avoided_executions:3,
      gross_avoided_cost_usd:0.42,
      gross_cost_coverage:'full',
      seenrelay_overhead_usd:null,
      net_savings_usd:null
    }}
  });
  assert.match(r,/Actual avoided executions: 3/);
  assert.match(r,/Measured gross avoided cost: \\$0\\.420000/);
  assert.match(r,/Measured net savings: unknown/);
  assert.doesNotMatch(r,/Measured net savings: \\$0\\.420000/);
});
