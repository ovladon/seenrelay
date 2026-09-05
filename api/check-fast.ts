import process from 'node:process';
import { neon } from '@neondatabase/serverless';
import { canonicalFact, canonicalFactKey, ValidationError } from '../src/canonical.js';
import { config } from '../src/config.js';
import { boundedRequest, readJsonBody } from '../src/http.js';
import { assertRuntimeFactAllowed } from '../src/runtime-guard.js';
import { admitHive, finishHiveCheck, hiveClass, verifyHiveLeaseTokenForTest } from '../src/hive.js';
import { checkFact } from '../src/service.js';
import { deriveClientKey, deriveOperationNetworkKey, deriveReuseIndependenceKey } from '../src/identity.js';
import { isVerifiedInternalTelemetry } from '../src/traffic-classification.js';
import { predicateGuidance } from '../src/predicates.js';
import { normalizeStoredValueFingerprint, valueFingerprint } from '../src/value-fingerprint.js';
import type { CheckRequest, CheckStatus, HivePublicState, JsonValue } from '../src/types.js';

const sql = () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
};

function isoFromMs(ms:number){ return new Date(ms).toISOString(); }
function epochMs(iso:string){ return Date.parse(iso); }
function clampMaxAge(requested:number|undefined,cfg:ReturnType<typeof config>){
  if(requested===undefined)return cfg.defaultMaxAgeSeconds;
  if(!Number.isInteger(requested)||requested<1||requested>cfg.maxMaxAgeSeconds)throw new ValidationError(`max_age_seconds must be an integer between 1 and ${cfg.maxMaxAgeSeconds}`);
  return requested;
}
function factIdentityMetadata(fact:Awaited<ReturnType<typeof canonicalFactKey>>){
  const guidance=fact.identityBasis==='predicate'?predicateGuidance(fact.predicate):undefined;
  return {fact_identity_version:fact.identityVersion,fact_identity_basis:fact.identityBasis,...(guidance?{predicate_guidance:guidance}:{})};
}
function parseSourceValidator(value:JsonValue|null){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const r=value as Record<string,JsonValue>; const kind=r.kind; const raw=r.value;
  if(!['etag','last_modified','content_hash','other'].includes(String(kind)))return null;
  if(typeof raw!=='string'||raw.length<1||raw.length>512||/[\r\n]/.test(raw))return null;
  return {kind:String(kind) as 'etag'|'last_modified'|'content_hash'|'other',value:raw};
}
function sourceValidatorMetadata(validator:ReturnType<typeof parseSourceValidator>){
  if(!validator)return {};
  const conditionalRequestHint=validator.kind==='etag'?{request_header:'If-None-Match',header_value:validator.value}:validator.kind==='last_modified'?{request_header:'If-Modified-Since',header_value:validator.value}:undefined;
  return {source_validator:validator,source_validator_assurance:'observer_supplied_unverified' as const,...(conditionalRequestHint?{conditional_request_hint:conditionalRequestHint}:{}),source_validator_caveat:'Observer-supplied metadata only. SeenRelay did not verify this validator against the source.'};
}
function publicState(row:any,token:string,retryAfterSeconds?:number):HivePublicState{
  return {lease:token,class:hiveClass(row),check_tokens_remaining:Math.max(0,Math.round(Number(row.check_tokens)*1000)/1000),contribution_score:Math.round(Number(row.contribution_score)*1000)/1000,useful_reuse_generated:Number(row.useful_reuse_generated),useful_reuse_consumed:Number(row.useful_reuse_consumed),free_bootstrap:true,...(retryAfterSeconds?{retry_after_seconds:retryAfterSeconds}:{})};
}
function emptyState(retryAfterSeconds:number):HivePublicState{return{lease:'',class:'new',check_tokens_remaining:0,contribution_score:0,useful_reuse_generated:0,useful_reuse_consumed:0,free_bootstrap:true,retry_after_seconds:retryAfterSeconds};}
function retryAfter(row:any,refillPerMinute:number){if(refillPerMinute<=0)return 60;return Math.max(1,Math.ceil(((1-Math.max(0,Number(row.check_tokens)))/refillPerMinute)*60));}

async function prepareCheck(body:CheckRequest){
  if(!body||typeof body!=='object'||!('known_value' in body))throw new ValidationError('known_value is required');
  const cfg=config(),nowMs=Date.now(),maxAge=clampMaxAge(body.max_age_seconds,cfg),fact=await canonicalFactKey(body.fact),known=await valueFingerprint(fact.factKey,body.known_value),cutoffIso=isoFromMs(nowMs-maxAge*1000);
  return{cfg,nowMs,maxAge,fact,known,cutoffIso};
}

async function mergeGroups(factKey:string,rows:any[]){
  const merged=new Map<string,any>();
  const earlier=(a:string,b:string)=>Date.parse(a)<=Date.parse(b)?a:b;
  const later=(a:string,b:string)=>Date.parse(a)>=Date.parse(b)?a:b;
  for(const row of rows||[]){
    const valueHash=await normalizeStoredValueFingerprint(factKey,String(row.value_hash));
    const validator=parseSourceValidator((row.source_validator??null) as JsonValue|null);
    const existing=merged.get(valueHash);
    const normalized={value_hash:valueHash,first_seen:String(row.first_seen),last_seen:String(row.last_seen),observations:Number(row.observations),observers:Number(row.observers),cryptographic_observers:Number(row.cryptographic_observers),unverified_observers:Number(row.unverified_observers),reuse_independence_buckets:Number(row.reuse_independence_buckets??0),source_validator:validator};
    if(!existing){merged.set(valueHash,normalized);continue;}
    const rowIsNewer=Date.parse(normalized.last_seen)>Date.parse(existing.last_seen);
    merged.set(valueHash,{value_hash:valueHash,first_seen:earlier(existing.first_seen,normalized.first_seen),last_seen:later(existing.last_seen,normalized.last_seen),observations:existing.observations+normalized.observations,observers:Math.max(existing.observers,normalized.observers),cryptographic_observers:Math.max(existing.cryptographic_observers,normalized.cryptographic_observers),unverified_observers:Math.max(existing.unverified_observers,normalized.unverified_observers),reuse_independence_buckets:Math.max(existing.reuse_independence_buckets,normalized.reuse_independence_buckets),source_validator:rowIsNewer?validator:existing.source_validator});
  }
  return[...merged.values()].sort((a,b)=>Date.parse(b.last_seen)-Date.parse(a.last_seen)).slice(0,4);
}

async function evaluatePrepared(prepared:Awaited<ReturnType<typeof prepareCheck>>,stored:any,rawGroups:any[]){
  const {cfg,nowMs,maxAge,fact,known}=prepared;
  if(!stored||!stored.last_observed_at)return{status:'UNKNOWN' as const,fact_key:fact.factKey,...factIdentityMetadata(fact),max_age_seconds:maxAge,next_step:'VALIDATE_THEN_OBSERVE' as const,accepted_observation_can_answer_later_checks:true,note:'No accepted observation exists. Validate normally, then OBSERVE; later CHECKs, including from the same integration or fleet, can benefit.'};
  const groups=await mergeGroups(fact.factKey,rawGroups);
  if(groups.length===0)return{status:'STALE' as const,fact_key:fact.factKey,...factIdentityMetadata(fact),known_value_hash:known.valueHash,value_fingerprint_version:known.version,last_observed_at:String(stored.last_observed_at),age_seconds:Math.max(0,Math.floor((nowMs-epochMs(String(stored.last_observed_at)))/1000)),max_age_seconds:maxAge,observation_total:Number(stored.observation_total),next_step:'VALIDATE_THEN_OBSERVE' as const,accepted_observation_can_answer_later_checks:true};
  const latest=groups[0],second=groups[1],contested=Boolean(second&&Math.abs(epochMs(latest.last_seen)-epochMs(second.last_seen))<=cfg.conflictWindowSeconds*1000);
  const evidence=groups.map(g=>({value_hash:g.value_hash,first_seen:g.first_seen,last_seen:g.last_seen,age_seconds:Math.max(0,Math.floor((nowMs-epochMs(g.last_seen))/1000)),observations:g.observations,observer_keys:g.observers,cryptographic_observer_keys:g.cryptographic_observers,unverified_observer_keys:g.unverified_observers,reuse_independence_buckets:g.reuse_independence_buckets,...(g.source_validator?{source_validator:g.source_validator,source_validator_assurance:'observer_supplied_unverified' as const}:{})}));
  if(contested)return{status:'CONTESTED' as const,fact_key:fact.factKey,...factIdentityMetadata(fact),known_value_hash:known.valueHash,value_fingerprint_version:known.version,max_age_seconds:maxAge,conflict_window_seconds:cfg.conflictWindowSeconds,evidence,caveat:'Distinct observer keys and privacy-salted reuse-independence buckets are signals, not proof of independent real-world actors. Cryptographic keys prove key possession and continuity only.'};
  const same=latest.value_hash===known.valueHash;
  return{status:same?('SAME_OBSERVED' as const):('CHANGED_OBSERVED' as const),fact_key:fact.factKey,...factIdentityMetadata(fact),known_value_hash:known.valueHash,latest_value_hash:latest.value_hash,value_fingerprint_version:known.version,first_seen_latest:latest.first_seen,last_seen_latest:latest.last_seen,age_seconds:Math.max(0,Math.floor((nowMs-epochMs(latest.last_seen))/1000)),max_age_seconds:maxAge,recent_observations:latest.observations,recent_observer_keys:latest.observers,recent_cryptographic_observer_keys:latest.cryptographic_observers,recent_unverified_observer_keys:latest.unverified_observers,recent_reuse_independence_buckets:latest.reuse_independence_buckets,...sourceValidatorMetadata(latest.source_validator),evidence,caveat:'SeenRelay reports recent observations; it does not assert universal truth. Observer keys, cryptographic continuity and privacy-salted reuse-independence buckets are signals only, not proof of independent real-world actors.'};
}

async function fastWave1(request:Request,prepared:Awaited<ReturnType<typeof prepareCheck>>,leaseId:string,token:string){
  const {cfg,cutoffIso,fact}=prepared; const nowIso=new Date().toISOString();
  const [operationKey,independenceKey,internalTelemetry]=await Promise.all([deriveOperationNetworkKey(request,'check'),deriveReuseIndependenceKey(request),isVerifiedInternalTelemetry(request)]);
  const rows=await sql().query(`WITH policy_raw AS (
      SELECT mode,checks_enabled,rewards_enabled,capacity_multiplier::float8,refill_multiplier::float8 FROM runtime_controls WHERE control_id='global'
    ), policy AS (
      SELECT mode,(checks_enabled AND mode<>'FREEZE') AS allowed,
        CASE WHEN mode IN ('SHIELD','READ_ONLY','FREEZE') THEN false ELSE rewards_enabled END AS rewards_enabled,
        CASE WHEN mode='SHIELD' THEN LEAST(capacity_multiplier,0.25) WHEN mode='FREEZE' THEN 0 ELSE capacity_multiplier END AS capacity_multiplier,
        CASE WHEN mode='SHIELD' THEN LEAST(refill_multiplier,0.25) WHEN mode='FREEZE' THEN 0 ELSE refill_multiplier END AS refill_multiplier
      FROM policy_raw
    ), bucket AS (SELECT date_trunc('minute',$2::timestamptz) AS window_start), admitted AS (
      INSERT INTO hive_admission_windows(admission_key,window_start,admissions,updated_at)
      SELECT $1,b.window_start,1,$2::timestamptz FROM bucket b CROSS JOIN policy p WHERE p.allowed
      ON CONFLICT(admission_key,window_start) DO UPDATE SET admissions=hive_admission_windows.admissions+1,updated_at=EXCLUDED.updated_at
      WHERE hive_admission_windows.admissions<$3::int RETURNING admissions
    ), calc AS (
      SELECT h.lease_id,
        LEAST($5::float8*p.capacity_multiplier+LEAST($7::float8*p.capacity_multiplier,h.contribution_score*$6::float8*p.capacity_multiplier),
          h.check_tokens+GREATEST(0,EXTRACT(EPOCH FROM($2::timestamptz-h.last_refill_at)))*(($8::float8*p.refill_multiplier+LEAST($10::float8*p.refill_multiplier,h.contribution_score*$9::float8*p.refill_multiplier))/60.0)) AS replenished,
        p.rewards_enabled,p.capacity_multiplier,p.refill_multiplier
      FROM hive_leases h CROSS JOIN policy p
      WHERE h.lease_id=$4 AND h.expires_at>$2::timestamptz AND (($12::boolean AND h.client_key LIKE 'internal:%') OR (NOT $12::boolean AND h.client_key NOT LIKE 'internal:%'))
        AND EXISTS(SELECT 1 FROM admitted)
    ), consumed AS (
      UPDATE hive_leases h SET independence_key=COALESCE(h.independence_key,$11::text),check_tokens=CASE WHEN calc.replenished>=1 THEN calc.replenished-1 ELSE calc.replenished END,last_refill_at=$2::timestamptz,last_seen_at=$2::timestamptz,check_count=h.check_count+CASE WHEN calc.replenished>=1 THEN 1 ELSE 0 END
      FROM calc WHERE h.lease_id=calc.lease_id
      RETURNING h.lease_id,h.check_tokens::float8,h.useful_reuse_generated::int,h.useful_reuse_consumed::int,h.contribution_score::float8,(calc.replenished>=1) AS lease_allowed,calc.rewards_enabled,calc.refill_multiplier
    ), fact_row AS (
      SELECT f.fact_key,f.subject,f.predicate,f.qualifiers_json,f.source_url,f.last_observed_at::text AS last_observed_at,f.observation_total::int AS observation_total,f.current_value_hash,f.current_first_seen_at::text AS current_first_seen_at,f.current_last_seen_at::text AS current_last_seen_at,f.previous_value_hash,f.previous_last_seen_at::text AS previous_last_seen_at
      FROM facts f WHERE f.fact_key=$13 AND EXISTS(SELECT 1 FROM consumed c WHERE c.lease_allowed)
    ), groups AS (
      SELECT o.value_hash,MAX(o.observed_at)::text AS last_seen,MIN(o.observed_at)::text AS first_seen,COUNT(*)::int AS observations,COUNT(DISTINCT o.observer_key)::int AS observers,COUNT(DISTINCT CASE WHEN o.observer_key LIKE 'ed25519:%' THEN o.observer_key END)::int AS cryptographic_observers,COUNT(DISTINCT CASE WHEN o.observer_key NOT LIKE 'ed25519:%' THEN o.observer_key END)::int AS unverified_observers,COUNT(DISTINCT CASE WHEN h.independence_key IS NOT NULL THEN h.independence_key END)::int AS reuse_independence_buckets,
        (SELECT o2.source_validator_json FROM observations_recent o2 WHERE o2.fact_key=o.fact_key AND o2.value_hash=o.value_hash AND o2.observed_at>=$14::timestamptz ORDER BY o2.observed_at DESC,o2.received_at DESC LIMIT 1) AS source_validator
      FROM observations_recent o LEFT JOIN hive_leases h ON h.lease_id=o.lease_id
      WHERE o.fact_key=$13 AND o.observed_at>=$14::timestamptz AND EXISTS(SELECT 1 FROM consumed c WHERE c.lease_allowed)
      GROUP BY o.fact_key,o.value_hash ORDER BY MAX(o.observed_at) DESC LIMIT 8
    )
    SELECT p.allowed AS runtime_allowed,p.mode,EXISTS(SELECT 1 FROM admitted) AS network_admitted,
      GREATEST(1,CEIL(EXTRACT(EPOCH FROM((SELECT window_start FROM bucket)+interval '1 minute'-$2::timestamptz))))::int AS network_retry_after_seconds,
      c.*,COALESCE((SELECT row_to_json(f) FROM fact_row f LIMIT 1),'null'::json) AS fact_json,
      COALESCE((SELECT json_agg(g ORDER BY g.last_seen DESC) FROM groups g),'[]'::json) AS groups_json
    FROM policy p LEFT JOIN consumed c ON true`,[
      operationKey,nowIso,cfg.hiveMaxChecksPerNetworkPerMinute,leaseId,cfg.hiveCheckCapacity,cfg.hiveCapacityBonusPerScore,cfg.hiveMaxCapacityBonus,cfg.hiveCheckRefillPerMinute,cfg.hiveRefillBonusPerScorePerMinute,cfg.hiveMaxRefillBonusPerMinute,independenceKey,internalTelemetry,fact.factKey,cutoffIso
    ]);
  const row=rows[0] as any;
  if(!row)throw new Error('fast CHECK admission returned no policy row');
  if(!row.runtime_allowed)return{kind:'runtime_disabled' as const,state:emptyState(60)};
  if(!row.network_admitted)return{kind:'admission_limited' as const,state:emptyState(Number(row.network_retry_after_seconds)||60)};
  if(!row.lease_id)return{kind:'fast_miss' as const};
  const refill=cfg.hiveCheckRefillPerMinute*Number(row.refill_multiplier)+Math.min(cfg.hiveMaxRefillBonusPerMinute*Number(row.refill_multiplier),Number(row.contribution_score)*cfg.hiveRefillBonusPerScorePerMinute*Number(row.refill_multiplier));
  const state=publicState(row,token,row.lease_allowed?undefined:retryAfter(row,refill));
  if(!row.lease_allowed)return{kind:'rate_limited' as const,state};
  return{kind:'allowed' as const,state,rewardsEnabled:Boolean(row.rewards_enabled),fact:row.fact_json,groups:Array.isArray(row.groups_json)?row.groups_json:[]};
}

async function fastWave2(admission:{state:HivePublicState,rewardsEnabled:boolean,leaseId:string},result:{status:CheckStatus;fact_key:string;latest_value_hash?:string;max_age_seconds:number}){
  const cfg=config(),nowIso=new Date().toISOString(),eligible=admission.rewardsEnabled&&(result.status==='SAME_OBSERVED'||result.status==='CHANGED_OBSERVED')&&Boolean(result.latest_value_hash),cutoffIso=new Date(Date.now()-result.max_age_seconds*1000).toISOString();
  const counters={checks:1,unknown:result.status==='UNKNOWN'?1:0,stale:result.status==='STALE'?1:0,same_observed:result.status==='SAME_OBSERVED'?1:0,changed_observed:result.status==='CHANGED_OBSERVED'?1:0,contested:result.status==='CONTESTED'?1:0};
  const rows=await sql().query(`WITH consumer AS (SELECT lease_id,independence_key FROM hive_leases WHERE lease_id=$4), contributors AS (
      SELECT DISTINCT o.lease_id AS contributor_lease_id FROM observations_recent o JOIN hive_leases c ON c.lease_id=o.lease_id CROSS JOIN consumer u
      WHERE $8::boolean AND o.fact_key=$1 AND o.value_hash=$2 AND o.observed_at>=$3::timestamptz AND o.lease_id IS NOT NULL AND o.lease_id<>$4 AND c.independence_key IS NOT NULL AND u.independence_key IS NOT NULL AND c.independence_key<>u.independence_key
        AND (SELECT COUNT(*) FROM useful_reuse_events e WHERE e.contributor_lease_id=c.lease_id AND e.created_at>=date_trunc('day',$5::timestamptz))<$7::int
    ), ins AS (
      INSERT INTO useful_reuse_events(fact_key,value_hash,contributor_lease_id,consumer_lease_id,created_at,utility_units)
      SELECT $1,$2,contributor_lease_id,$4,$5::timestamptz,$6::float8 FROM contributors
      ON CONFLICT(fact_key,value_hash,contributor_lease_id,consumer_lease_id) DO NOTHING RETURNING contributor_lease_id,utility_units
    ), bumped AS (
      UPDATE hive_leases h SET contribution_score=h.contribution_score+i.utility_units,useful_reuse_generated=h.useful_reuse_generated+1 FROM ins i WHERE h.lease_id=i.contributor_lease_id RETURNING h.lease_id
    ), consumer_update AS (
      UPDATE hive_leases SET useful_reuse_consumed=useful_reuse_consumed+CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END,last_seen_at=$5::timestamptz,last_fact_key=$1,last_operation='CHECK',last_outcome=$9
      WHERE lease_id=$4 RETURNING lease_id
    ), metric AS (
      INSERT INTO hive_metrics_daily(day,checks,observes,unknown,stale,same_observed,changed_observed,contested,useful_reuse,new_leases)
      VALUES($5::timestamptz::date,$10,0,$11,$12,$13,$14,$15,CASE WHEN EXISTS(SELECT 1 FROM ins) THEN 1 ELSE 0 END,0)
      ON CONFLICT(day) DO UPDATE SET checks=hive_metrics_daily.checks+EXCLUDED.checks,observes=hive_metrics_daily.observes+EXCLUDED.observes,unknown=hive_metrics_daily.unknown+EXCLUDED.unknown,stale=hive_metrics_daily.stale+EXCLUDED.stale,same_observed=hive_metrics_daily.same_observed+EXCLUDED.same_observed,changed_observed=hive_metrics_daily.changed_observed+EXCLUDED.changed_observed,contested=hive_metrics_daily.contested+EXCLUDED.contested,useful_reuse=hive_metrics_daily.useful_reuse+EXCLUDED.useful_reuse,new_leases=hive_metrics_daily.new_leases+EXCLUDED.new_leases RETURNING day
    )
    SELECT (SELECT COUNT(*)::int FROM ins) AS awarded,EXISTS(SELECT 1 FROM consumer_update) AS consumer_updated,EXISTS(SELECT 1 FROM metric) AS metric_written`,[
      result.fact_key,result.latest_value_hash||'',cutoffIso,admission.leaseId,nowIso,cfg.usefulReuseScoreUnits,cfg.usefulReuseDailyAwardCap,eligible,result.status,counters.checks,counters.unknown,counters.stale,counters.same_observed,counters.changed_observed,counters.contested
    ]);
  const awards=Number((rows[0] as any)?.awarded||0);
  return{state:awards>0?{...admission.state,useful_reuse_consumed:admission.state.useful_reuse_consumed+1}:admission.state,usefulReuseAwards:awards};
}

function jsonResponse(body:any,status:number,headers:Headers){return new Response(JSON.stringify(body),{status,headers});}

export default async function handler(input:Request):Promise<Response>{
  const appStart=performance.now(),cpuStart=process.cpuUsage();
  const headers=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
  try{
    if(process.env.VERCEL_ENV==='production')return jsonResponse({error:{code:'NOT_FOUND',detail:'No such endpoint.'}},404,headers);
    if(input.method!=='POST')return jsonResponse({error:{code:'METHOD_NOT_ALLOWED',detail:'POST required.'}},405,headers);
    const bounded=await boundedRequest(input,config().maxBodyBytes); if('response' in bounded)return bounded.response;
    const request=bounded.request,body=await readJsonBody<CheckRequest>(request,config().maxBodyBytes); canonicalFact(body.fact); assertRuntimeFactAllowed(body.fact);
    const supplied=request.headers.get('x-seenrelay-lease')||''; const verified=supplied?await verifyHiveLeaseTokenForTest(supplied):null;
    let payload:any,status=200;
    if(!verified||verified.key!=='current'){
      const admission=await admitHive(request,'check');
      if(!admission.allowed){
        if(admission.reason==='runtime_disabled'){status=503;payload={error:{code:'SERVICE_CONTROLLED',detail:'CHECK is temporarily disabled by the SeenRelay control plane.'},hive:admission.state};}
        else if(admission.reason==='admission_limited'){status=429;payload={error:{code:'HIVE_ADMISSION_LIMITED',detail:'Hive operations from this network are temporarily limited. Retry shortly.'},hive:admission.state};}
        else{headers.set('x-seenrelay-lease',admission.token);status=429;payload={error:{code:'HIVE_RATE_LIMITED',detail:'Free CHECK allowance is refilling.'},hive:admission.state};}
      }else{
        headers.set('x-seenrelay-lease',admission.token);const result=await checkFact(body),finished=await finishHiveCheck(admission,result);payload={...result,hive:finished.state,useful_reuse_awards:finished.usefulReuseAwards};
      }
    }else{
      const prepared=await prepareCheck(body),wave1=await fastWave1(request,prepared,verified.leaseId,supplied);
      if(wave1.kind==='runtime_disabled'){status=503;payload={error:{code:'SERVICE_CONTROLLED',detail:'CHECK is temporarily disabled by the SeenRelay control plane.'},hive:wave1.state};}
      else if(wave1.kind==='admission_limited'){status=429;payload={error:{code:'HIVE_ADMISSION_LIMITED',detail:'Hive operations from this network are temporarily limited. Retry shortly.'},hive:wave1.state};}
      else if(wave1.kind==='rate_limited'){headers.set('x-seenrelay-lease',supplied);status=429;payload={error:{code:'HIVE_RATE_LIMITED',detail:'Free CHECK allowance is refilling.'},hive:wave1.state};}
      else if(wave1.kind==='fast_miss'){status=409;payload={error:{code:'FAST_PATH_MISS',detail:'Valid lease token did not resolve to an eligible fast-path lease.'}};}
      else{
        headers.set('x-seenrelay-lease',supplied);const result=await evaluatePrepared(prepared,wave1.fact,wave1.groups),finished=await fastWave2({state:wave1.state,rewardsEnabled:wave1.rewardsEnabled,leaseId:verified.leaseId},result);payload={...result,hive:finished.state,useful_reuse_awards:finished.usefulReuseAwards};
      }
    }
    const clientKey=await deriveClientKey(request); console.log(JSON.stringify({event:'check-fast-preview',client_key:clientKey,status:payload?.status||payload?.error?.code||status}));
    return jsonResponse(payload,status,headers);
  }catch(err){
    if(err instanceof ValidationError)return jsonResponse({error:{code:'INVALID_REQUEST',detail:err.message}},400,headers);
    console.error(JSON.stringify({event:'check-fast-preview-error',error:err instanceof Error?err.message:'unknown'}));
    return jsonResponse({error:{code:'INTERNAL_ERROR',detail:'Request could not be completed.'}},500,headers);
  }finally{
    const cpu=process.cpuUsage(cpuStart),cpuMs=(cpu.user+cpu.system)/1000,appMs=performance.now()-appStart;
    headers.set('server-timing',`app;dur=${Math.max(0.001,appMs).toFixed(3)}, cpu;dur=${Math.max(0.001,cpuMs).toFixed(3)}`);
    headers.set('x-seenrelay-lab-check-timing','v1');headers.set('x-seenrelay-lab-check-commit',process.env.VERCEL_GIT_COMMIT_SHA||'unknown');
  }
}
