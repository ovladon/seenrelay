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
    assert.equal(r.evidence_boundary.may_activate_billing,false);
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
