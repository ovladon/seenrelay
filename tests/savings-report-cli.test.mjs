import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildSavingsReportFromLedger} from '../clients/typescript/scripts/savings-report-lib.mjs';

const ledger={
  schema:'seenrelay-fleet-savings-ledger-v0',
  receipts:2,
  authoritativeExecutions:1,
  followerReuses:1,
  avoidedExecutions:1,
  grossAvoidedCostUsd:1.44,
  costedAvoidedExecutions:1,
  uncostedAvoidedExecutions:0,
  receiptPaths:{leader_execution:1,follower_reuse:1},
  costProvenance:{provider_list_price:2}
};

test('Savings Report proves avoided work but not USE, ROI or billing',()=>{
  const r=buildSavingsReportFromLedger(ledger);
  assert.equal(r.schema_version,'seenrelay-savings-report-v1');
  assert.equal(r.label,'Savings Report');
  assert.equal(r.machine_label,'Verified Savings Record');
  assert.equal(r.evidence.actual_avoided_executions,1);
  assert.equal(r.evidence.gross_avoided_cost_usd,1.44);
  assert.equal(r.evidence.net_savings_usd,null);
  assert.equal(r.economic_status,'GROSS_SAVINGS_MEASURED_NET_UNKNOWN');
  assert.equal(r.decision_boundary.use_verdict_emitted,false);
  assert.equal(r.decision_boundary.external_customer_claim,false);
  assert.equal(r.decision_boundary.customer_roi_proven,false);
  assert.equal(r.access_and_billing.billing_enabled,false);
  assert.equal(r.access_and_billing.is_payment_receipt,false);
});

test('measured overhead yields local net value but still requires native/SOTA and external review',()=>{
  const r=buildSavingsReportFromLedger(ledger,{overheadUsd:0.14});
  assert.ok(Math.abs(r.evidence.net_savings_usd-1.30)<1e-12);
  assert.equal(r.economic_status,'NET_POSITIVE_NEEDS_NATIVE_SOTA_AND_EXTERNAL_REVIEW');
  assert.equal(r.decision_boundary.native_sota_baseline_proven,false);
  assert.equal(r.decision_boundary.may_activate_billing,false);
});

test('uncosted reuse never invents dollars',()=>{
  const r=buildSavingsReportFromLedger({...ledger,grossAvoidedCostUsd:0,costedAvoidedExecutions:0,uncostedAvoidedExecutions:1});
  assert.equal(r.evidence.gross_avoided_cost_usd,null);
  assert.equal(r.evidence.net_savings_usd,null);
  assert.equal(r.economic_status,'AVOIDED_WORK_COST_UNKNOWN');
});

test('CLI accepts a ledger and remains local-only',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'sr-savings-report-'));
  const file=path.join(d,'ledger.json');
  fs.writeFileSync(file,JSON.stringify(ledger));
  const cli=new URL('../clients/typescript/scripts/seenrelay-cli.mjs',import.meta.url).pathname;
  const out=execFileSync(process.execPath,[cli,'savings-report',file,'--overhead-usd','0.14','--json'],{encoding:'utf8'});
  const r=JSON.parse(out);
  assert.equal(r.evidence.actual_avoided_executions,1);
  assert.ok(Math.abs(r.evidence.net_savings_usd-1.30)<1e-12);
  assert.equal(r.access_and_billing.payment_obligation_created,false);
});

test('CLI accepts JSONL fleet receipts',()=>{
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'sr-savings-jsonl-'));
  const file=path.join(d,'receipts.jsonl');
  const rows=[
    {schema:'seenrelay-fleet-savings-receipt-v0',path:'leader_execution',executedAuthoritative:true,reusedFollower:false,avoidedExecutions:0,grossAvoidedCostUsd:null,costProvenance:'provider_reported'},
    {schema:'seenrelay-fleet-savings-receipt-v0',path:'follower_reuse',executedAuthoritative:false,reusedFollower:true,avoidedExecutions:1,grossAvoidedCostUsd:0.5,costProvenance:'provider_reported'}
  ];
  fs.writeFileSync(file,rows.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const cli=new URL('../clients/typescript/scripts/seenrelay-cli.mjs',import.meta.url).pathname;
  const out=execFileSync(process.execPath,[cli,'savings-report',file,'--json'],{encoding:'utf8'});
  const r=JSON.parse(out);
  assert.equal(r.evidence.actual_avoided_executions,1);
  assert.equal(r.evidence.gross_avoided_cost_usd,0.5);
});
