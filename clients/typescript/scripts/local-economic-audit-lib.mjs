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
  return [
    'SeenRelay local economic audit',
    '==============================',
    'Kind: '+result.kind,
    'Status: '+result.status,
    'Next step: '+result.next_action,
    '',
    'This audit is local and non-commercial. No customer ROI, USE verdict, or billing authority is implied.'
  ].join('\n')+'\n';
}
