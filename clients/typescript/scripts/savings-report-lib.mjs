import fs from 'node:fs';

function nonNegative(value,label){
  const n=Number(value);
  if(!Number.isFinite(n)||n<0) throw new TypeError(label+' must be a non-negative finite number');
  return n;
}

function aggregateReceipts(receipts){
  const out={
    schema:'seenrelay-fleet-savings-ledger-v0',
    receipts:0,
    authoritativeExecutions:0,
    followerReuses:0,
    avoidedExecutions:0,
    grossAvoidedCostUsd:0,
    costedAvoidedExecutions:0,
    uncostedAvoidedExecutions:0,
    receiptPaths:{},
    costProvenance:{}
  };
  for(const r of receipts){
    if(!r||r.schema!=='seenrelay-fleet-savings-receipt-v0') throw new TypeError('receipt input contains a non-SeenRelay fleet savings receipt');
    out.receipts++;
    if(r.executedAuthoritative) out.authoritativeExecutions++;
    if(r.reusedFollower) out.followerReuses++;
    const avoided=nonNegative(r.avoidedExecutions??0,'receipt.avoidedExecutions');
    out.avoidedExecutions+=avoided;
    const p=String(r.path??'unknown');
    out.receiptPaths[p]=(out.receiptPaths[p]||0)+1;
    if(r.costProvenance){
      const cp=String(r.costProvenance);
      out.costProvenance[cp]=(out.costProvenance[cp]||0)+1;
    }
    if(avoided>0){
      if(r.grossAvoidedCostUsd===null||r.grossAvoidedCostUsd===undefined){
        out.uncostedAvoidedExecutions+=avoided;
      }else{
        out.costedAvoidedExecutions+=avoided;
        out.grossAvoidedCostUsd+=nonNegative(r.grossAvoidedCostUsd,'receipt.grossAvoidedCostUsd');
      }
    }
  }
  return out;
}

function normalizeLedger(value){
  if(value?.schema==='seenrelay-fleet-savings-ledger-v0') return value;
  if(Array.isArray(value)) return aggregateReceipts(value);
  if(Array.isArray(value?.receipts)) return aggregateReceipts(value.receipts);
  throw new TypeError('input must be a seenrelay-fleet-savings-ledger-v0 object, an array of fleet savings receipts, or an object with receipts[]');
}

function parseInput(file){
  const raw=fs.readFileSync(file,'utf8').trim();
  if(!raw) throw new TypeError('Savings Report input is empty');
  try{
    return normalizeLedger(JSON.parse(raw));
  }catch(error){
    if(error instanceof SyntaxError){
      const rows=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
        try{return JSON.parse(line);}
        catch{throw new TypeError('invalid JSONL receipt at line '+(i+1));}
      });
      return aggregateReceipts(rows);
    }
    throw error;
  }
}

export function buildSavingsReportFromLedger(ledger,{overheadUsd=null}={}){
  const receipts=nonNegative(ledger.receipts??0,'ledger.receipts');
  const authoritative=nonNegative(ledger.authoritativeExecutions??0,'ledger.authoritativeExecutions');
  const followers=nonNegative(ledger.followerReuses??0,'ledger.followerReuses');
  const avoided=nonNegative(ledger.avoidedExecutions??0,'ledger.avoidedExecutions');
  const costed=nonNegative(ledger.costedAvoidedExecutions??0,'ledger.costedAvoidedExecutions');
  const uncosted=nonNegative(ledger.uncostedAvoidedExecutions??0,'ledger.uncostedAvoidedExecutions');
  const grossKnown=nonNegative(ledger.grossAvoidedCostUsd??0,'ledger.grossAvoidedCostUsd');

  if(costed+uncosted<avoided) throw new TypeError('ledger cost coverage cannot be smaller than avoidedExecutions');
  if(followers<avoided) throw new TypeError('ledger followerReuses cannot be smaller than avoidedExecutions');

  const coverage=avoided===0?'not_applicable':uncosted===0?'full':costed===0?'unknown':'partial';
  const gross=avoided===0?0:(costed>0?grossKnown:null);
  const overhead=overheadUsd===null||overheadUsd===undefined?null:nonNegative(overheadUsd,'overheadUsd');
  const net=(coverage==='full'&&gross!==null&&overhead!==null)?gross-overhead:null;

  let status='NO_AVOIDED_EXECUTIONS';
  if(avoided>0&&coverage==='unknown') status='AVOIDED_WORK_COST_UNKNOWN';
  else if(avoided>0&&coverage==='partial') status='PARTIAL_GROSS_SAVINGS_ONLY';
  else if(avoided>0&&overhead===null) status='GROSS_SAVINGS_MEASURED_NET_UNKNOWN';
  else if(avoided>0&&net>0) status='NET_POSITIVE_NEEDS_NATIVE_SOTA_AND_EXTERNAL_REVIEW';
  else if(avoided>0&&net<=0) status='NET_NONPOSITIVE';

  return Object.freeze({
    schema_version:'seenrelay-savings-report-v1',
    label:'Savings Report',
    machine_label:'Verified Savings Record',
    generated_at:new Date().toISOString(),
    access_and_billing:{
      seenrelay_currently_free:true,
      billing_enabled:false,
      is_invoice:false,
      is_bill:false,
      is_charge:false,
      is_payment_receipt:false,
      payment_obligation_created:false
    },
    evidence:{
      source_schema:'seenrelay-fleet-savings-ledger-v0',
      mode:'local_active_coordination_measurement',
      actual_avoided_executions:avoided,
      authoritative_executions:authoritative,
      follower_reuses:followers,
      recorded_events:receipts,
      costed_avoided_executions:costed,
      uncosted_avoided_executions:uncosted,
      gross_cost_coverage:coverage,
      gross_avoided_cost_usd:gross,
      seenrelay_overhead_usd:overhead,
      net_savings_usd:net,
      receipt_paths:{...(ledger.receiptPaths||{})},
      cost_provenance:{...(ledger.costProvenance||{})}
    },
    economic_status:status,
    decision_boundary:{
      use_verdict_emitted:false,
      external_customer_claim:false,
      customer_roi_proven:false,
      native_sota_baseline_proven:false,
      may_authorize_reuse:false,
      may_activate_billing:false,
      next_step: avoided>0
        ? 'Measure SeenRelay overhead and strongest native/SOTA comparator, then review external/customer evidence before any USE or commercial claim.'
        : 'No actual follower reuse was measured; do not claim savings.'
    }
  });
}

export function buildSavingsReportFromFile(file,options={}){
  return buildSavingsReportFromLedger(parseInput(file),options);
}

export function renderSavingsReport(report){
  const e=report.evidence;
  const money=(v)=>v===null?'unknown':'$'+Number(v).toFixed(6);
  return [
    'SeenRelay Savings Report',
    '========================',
    'SeenRelay is currently free. This is measurement evidence, not an invoice or payment receipt.',
    '',
    'Actual avoided executions: '+e.actual_avoided_executions,
    'Follower reuses: '+e.follower_reuses,
    'Gross avoided cost: '+money(e.gross_avoided_cost_usd)+' ('+e.gross_cost_coverage+' cost coverage)',
    'SeenRelay overhead: '+money(e.seenrelay_overhead_usd),
    'Net savings: '+money(e.net_savings_usd),
    'Status: '+report.economic_status,
    '',
    'Boundary: no USE verdict, no external-customer/ROI claim, no billing authority.',
    'Next: '+report.decision_boundary.next_step,
    ''
  ].join('\n');
}
