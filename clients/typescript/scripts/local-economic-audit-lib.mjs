import fs from 'node:fs/promises';
import { buildGuidedAdoption } from './guided-adoption-lib.mjs';
import { analyzeFleetTraceFile } from './fleet-trace-census-lib.mjs';
import { analyzeOtelFleetTraceFile } from './otel-trace-census-lib.mjs';
import { analyzeLangfuseObservationsFile } from './langfuse-census-lib.mjs';
import { buildSavingsReportFromFile } from './savings-report-lib.mjs';

function isObject(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

function firstRecord(text) {
  const t=text.trim();
  if(!t) throw new TypeError('local audit input is empty');
  try {
    const x=JSON.parse(t);
    if(Array.isArray(x)) return {root:x,first:x[0]};
    if(isObject(x)&&Array.isArray(x.calls)) return {root:x,first:x.calls[0]};
    if(isObject(x)&&Array.isArray(x.data)) return {root:x,first:x.data[0]};
    if(isObject(x)&&Array.isArray(x.receipts)) return {root:x,first:x.receipts[0]};
    return {root:x,first:x};
  } catch (e) {
    if(!(e instanceof SyntaxError)) throw e;
    let first;
    try { first=JSON.parse(t.split(/\r?\n/,1)[0]); }
    catch { throw new TypeError('audit input must contain JSON or JSONL'); }
    return {root:null,first};
  }
}

export function identifyLocalAuditInput(text) {
  const {root,first}=firstRecord(text);
  if(isObject(root)&&root.schema==='seenrelay-fleet-savings-ledger-v0') return 'savings-ledger';
  if(isObject(root)&&(Array.isArray(root.resourceSpans)||Array.isArray(root.resource_spans))) return 'otlp';
  if(isObject(first)&&first.schema==='seenrelay-fleet-savings-receipt-v0') return 'savings-ledger';
  if(isObject(first)&&first.schema==='seenrelay-fleet-trace-event-v1') return 'fleet-trace';
  if(isObject(first)&&first.type==='TOOL' || (isObject(first)&&first.type==='GENERATION') ||
     (isObject(first)&&('traceId' in first||'trace_id' in first) && ('startTime' in first||'start_time' in first))) return 'langfuse';
  throw new TypeError('unsupported audit format; use scan/guide for project source or explicit trace-census, otel-trace-census, langfuse-census or savings-report');
}

function envelope(kind,report,{status,nextAction}) {
  return {
    schema_version:'seenrelay-local-economic-audit-v1',
    kind,
    status,
    report,
    next_action:nextAction,
    evidence_boundary:{
      requires_strongest_native_baseline:true,
      independent_customer_roi_proven:false,
      may_authorize_active_reuse:false,
      may_enable_billing:false,
      requires_authoritative_shadow_before_use:true
    },
    privacy_boundary:'All input and analysis stay on the local machine; this command does not upload files or contact SeenRelay.'
  };
}

export async function runLocalEconomicAudit(path, {overheadUsd=null}={}) {
  const stat=await fs.stat(path);
  if(stat.isDirectory()) {
    const report=await buildGuidedAdoption(path);
    return envelope('project-prescreen',report,{
      status:report.decision,
      nextAction:report.next_action?.instruction||'Do not install SeenRelay without independent measured fit.'
    });
  }
  if(!stat.isFile()) throw new TypeError('audit input must be a file or directory');
  // The existing analyzers enforce stricter policy/identity eligibility, so this
  // detector must never infer shareability from names or loose semantic similarity.
  const text=await fs.readFile(path,'utf8');
  const kind=identifyLocalAuditInput(text);
  if(kind==='savings-ledger') {
    const report=buildSavingsReportFromFile(path,{overheadUsd});
    return envelope(kind,report,{
      status:report.economic_status,
      nextAction:'Verify measured overhead, best native/provider baseline and independent customer provenance; a local ledger alone does not establish customer ROI.'
    });
  }
  if(overheadUsd!==null) throw new TypeError('--overhead-usd is only valid for measured savings ledgers/receipts');
  if(kind==='otlp'||kind==='fleet-trace') {
    const report=kind==='otlp'?await analyzeOtelFleetTraceFile(path):await analyzeFleetTraceFile(path);
    const potential=report.successful_leader_overlap_opportunities>0;
    return envelope(kind,report,{
      status:potential?'POTENTIAL_REQUIRES_NATIVE_AND_SHADOW_EVIDENCE':'NO_SAFE_INFLIGHT_OPPORTUNITY_OBSERVED',
      nextAction:potential
        ?'Compare the same natural workload against source/provider/native controls and measure overhead in shadow before any reuse.'
        :'No qualified in-flight opportunity was observed; do not install SeenRelay to manufacture overlap.'
    });
  }
  const report=await analyzeLangfuseObservationsFile(path);
  const potential=report.candidate_status==='NEEDS_POLICY_REVIEW';
  return envelope(kind,report,{
    status:potential?'POTENTIAL_REQUIRES_POLICY_AND_SHADOW_EVIDENCE':'NO_EXACT_REPEAT_CANDIDATES',
    nextAction:potential
      ?'Check read-only/freshness policy, source/provider native controls, trace identity and actual marginal tool costs before a shadow test.'
      :'No exact repeat candidate observed; do not install SeenRelay solely to create traffic.'
  });
}

export function renderLocalEconomicAudit(result) {
  const report=result.report;
  const money=(v)=>typeof v==='number'&&Number.isFinite(v)?'$'+v.toFixed(6):'unknown';
  const evidence=[
    '',
    'First-value meter (local evidence; not a bill):'
  ];
  if(result.kind==='project-prescreen') {
    evidence.push('Candidate files: '+(report.scan?.candidate_files??'unknown'));
    evidence.push('Cost opportunity: not measured (static project scan only)');
    evidence.push('Actual savings: not measured (no provider execution analyzed)');
  } else if(result.kind==='otlp'||result.kind==='fleet-trace') {
    const opportunities=report.successful_leader_overlap_opportunities??0;
    const priced=report.potential_avoided_costed_events??0;
    evidence.push('Observed safe in-flight overlap opportunities: '+opportunities);
    evidence.push('Gross potential on costed opportunities: '+(priced>0?money(report.gross_potential_avoided_cost_usd):'unknown (no priced eligible overlap)'));
    evidence.push('Priced opportunity coverage: '+priced+'/'+opportunities);
    evidence.push('Actual savings: not measured (trace analysis never skips calls)');
    evidence.push('Potential is before native/local alternatives, result equivalence and SeenRelay overhead.');
  } else if(result.kind==='langfuse') {
    evidence.push('Observed exact repeat starts: '+(report.exact_repeat_starts??0));
    evidence.push('Recorded spend on exact repeat starts: '+money(report.recorded_cost_on_exact_repeat_starts_usd));
    evidence.push('Actual savings: not measured (repeat spend is not avoidable spend)');
    evidence.push('Tool cost coverage and read-only/native eligibility require review.');
  } else if(result.kind==='savings-ledger') {
    const e=report.evidence;
    evidence.push('Actual avoided executions: '+e.actual_avoided_executions);
    evidence.push('Measured gross avoided cost: '+money(e.gross_avoided_cost_usd)+' ('+e.gross_cost_coverage+' coverage)');
    evidence.push('Measured SeenRelay overhead: '+money(e.seenrelay_overhead_usd));
    evidence.push('Measured net savings: '+money(e.net_savings_usd));
    evidence.push('Savings still require strongest native/SOTA and independent customer evidence before commercial claims.');
  }
  return [
    'SeenRelay local economic audit',
    '==============================',
    'Kind: '+result.kind,
    'Status: '+result.status,
    ...evidence,
    '',
    'Next step: '+result.next_action,
    '',
    'This audit is local and non-commercial. No customer ROI, USE verdict, or billing authority is implied.'
  ].join('\n')+'\n';
}
