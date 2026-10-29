#!/usr/bin/env python3
"""Generate deterministic, entirely synthetic AUDR 1.0.0 records. No real telemetry."""
import hashlib, json, datetime, pathlib
BASE = pathlib.Path(__file__).resolve().parent
ROOT = datetime.datetime(2026,10,29,12,0,0,tzinfo=datetime.timezone.utc)
def h(s): return 'sha256:'+hashlib.sha256(('synthetic-kora-seenrelay-v0|'+s).encode()).hexdigest()
def t(i): return (ROOT+datetime.timedelta(seconds=i)).isoformat(timespec='milliseconds').replace('+00:00','Z')
CASES = [
 ('compatible_read','SHADOW_CANDIDATE',{}),
 ('native_zero_cost','NATIVE_CONTROL_FIRST',{'native_hit':True}),
 ('different_arguments','NOT_DUPLICATE',{'args_change':True}),
 ('source_version_change','REVALIDATION_REQUIRED',{'version_change':True}),
 ('same_result_but_source_changed','REVALIDATION_REQUIRED',{'version_change':True}),
 ('result_mismatch','REVALIDATION_REQUIRED',{'result_change':True}),
 ('expired_proof','REVALIDATION_REQUIRED',{'expire':True}),
 ('tenant_change','REJECT_SCOPE',{'tenant_change':True}),
 ('auth_scope_change','REJECT_SCOPE',{'auth_change':True}),
 ('independent_review','REJECT_UNSAFE',{'independent':True}),
 ('side_effect','REJECT_UNSAFE',{'side_effect':True}),
 ('missing_source_proof','INSUFFICIENT_EVIDENCE',{'missing_proof':True}),
 ('timeout_retry','INSUFFICIENT_EVIDENCE',{'timeout':True}),
 ('event_stream_gap','INSUFFICIENT_EVIDENCE',{'gap':True}),
 ('incomplete_dependencies','INSUFFICIENT_EVIDENCE',{'incomplete':True}),
 ('strict_latest_without_watermark','INSUFFICIENT_EVIDENCE',{'strict_no_watermark':True}),
]
rows=[]; expected=[]
for index,(case,outcome,opt) in enumerate(CASES,1):
  records=[]
  for j in range(2):
    tick=(index-1)*20+j*2
    labels={
      'tool_args_hash':h('arg:'+case+('changed' if j and opt.get('args_change') else '')),
      'tool_result_hash':h('result:'+case+('changed' if j and opt.get('result_change') else '')),
      'operation_status':'timeout' if j==0 and opt.get('timeout') else 'success',
      'sr.tenant_hmac':h('tenant:'+case+('other' if j and opt.get('tenant_change') else '')),
      'sr.auth_scope_hmac':h('auth:'+case+('other' if j and opt.get('auth_change') else '')),
      'sr.environment_hash':h('environment-v1'),
      'sr.source_version_hash':h('source:'+case+('v2' if j and opt.get('version_change') else 'v1')),
      'sr.dependencies_hash':h('dependencies:'+case),
      'sr.dependencies_complete':'false' if opt.get('incomplete') else 'true',
      'sr.hard_valid_until':t(tick-1 if opt.get('expire') else tick+20),
      'sr.source_confirmation':'none' if opt.get('missing_proof') else 'synthetic_source_native_304',
      'sr.freshness_policy':'strict_latest' if opt.get('strict_no_watermark') else 'bounded',
      'sr.stream_gap_free':'false' if opt.get('gap') else 'true',
      'sr.stream_watermark_verified':'false' if opt.get('strict_no_watermark') else 'true',
      'sr.side_effect_class':'write' if opt.get('side_effect') else 'read_only',
      'sr.independent_samples_required':'true' if opt.get('independent') else 'false',
      'sr.exact_single_answer_shareable':'true',
      'sr.native_zero_marginal_cost_hit':'true' if opt.get('native_hit') else 'false',
    }
    if opt.get('missing_proof'): labels.pop('sr.source_confirmation')
    rec={
      'spec_version':'1.0.0',
      'record_id':'01KD'+'0'*19+f'{index:02d}{j}',
      'emitter':{'component':'harness','name':'seenrelay-kora-synthetic','version':'0.1.0'},
      'timing':{'event_time':t(tick),'duration_ms':75+j*10},
      'resource':{'provider':'fixture-provider','type':'tool','name':'read_public_document','operation':'retrieval','modality':'text'},
      'run':{'run_id':f'kora-sr-{case}','span_id':f'span-{index}-{j}','step':j+1,'run_type':'agent_run','name':'Synthetic interoperability case'},
      'attribution':{'environment':'test','labels':labels},
      'usage':{'tool':{'type':'retrieval','call_count':1}},
      'cost':{'total_cost':0.002,'currency':'USD','tool':{'type':'retrieval','call_cost':0.002}},
    }
    records.append(rec); rows.append(rec)
  expected.append({'case':case,'run_id':f'kora-sr-{case}','record_ids':[r['record_id'] for r in records],'expected':outcome})
(BASE/'fixture.audr.jsonl').write_text(''.join(json.dumps(r,separators=(',',':'))+'\n' for r in rows),encoding='utf-8')
(BASE/'expected.json').write_text(json.dumps({'schema':'seenrelay-kora-interop-expected-v0','fixture_type':'synthetic','cases':expected},indent=2)+'\n',encoding='utf-8')
print('generated',len(expected),'cases',len(rows),'AUDR records')
