import fs from 'node:fs';
import { createHash } from 'node:crypto';

const SHA=/^sha256:[0-9a-f]{64}$/;
const POLICY=JSON.parse(fs.readFileSync(new URL('../research/neutral-task-admission-v1.json',import.meta.url),'utf8'));

function stable(v){
  if(v===null||typeof v==='string'||typeof v==='boolean') return JSON.stringify(v);
  if(typeof v==='number'){if(!Number.isFinite(v)) throw new TypeError('non-finite value');return JSON.stringify(v);}
  if(Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if(v&&typeof v==='object') return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  throw new TypeError('unsupported value');
}
function fp(v){return `sha256:${createHash('sha256').update(stable(v)).digest('hex')}`;}
function requireSha(v,name){if(typeof v!=='string'||!SHA.test(v)) throw new TypeError(`${name} must be sha256:<64 lowercase hex>`);return v;}

/**
 * Selects the first N eligible attempts per logical task from evidence supplied
 * in externally committed chronological source order. No task ids, prompts,
 * source payloads, or timestamps are retained in the result.
 */
export function assembleNeutralTaskChronologicalCohort(input){
  if(!input||typeof input!=='object'||Array.isArray(input)) throw new TypeError('input must be object');
  const workloadId=String(input.workloadId||'');
  const floor=POLICY.sample_floors[workloadId];
  if(!floor) throw new TypeError('unknown workloadId');
  const sourceSequenceFingerprint=requireSha(input.sourceSequenceFingerprint,'sourceSequenceFingerprint');
  const samplingProtocolFingerprint=requireSha(input.samplingProtocolFingerprint,'samplingProtocolFingerprint');
  if(!Array.isArray(input.evidence)||input.evidence.length===0) throw new TypeError('evidence must be non-empty array');

  const seenAttempts=new Set();
  const discoveredTasks=new Set();
  const selectedByTask=new Map();
  const sourceProofs=[];

  for(let sourceIndex=0;sourceIndex<input.evidence.length;sourceIndex+=1){
    const evidence=input.evidence[sourceIndex];
    if(!evidence||typeof evidence!=='object'||Array.isArray(evidence)) throw new TypeError(`evidence[${sourceIndex}] must be object`);
    if(evidence.proof_fingerprint!==undefined) sourceProofs.push(requireSha(evidence.proof_fingerprint,`evidence[${sourceIndex}].proof_fingerprint`));
    if(!Array.isArray(evidence.normalized_attempts)||evidence.normalized_attempts.length===0) throw new TypeError(`evidence[${sourceIndex}].normalized_attempts required`);
    for(const attempt of evidence.normalized_attempts){
      if(!attempt||typeof attempt!=='object'||Array.isArray(attempt)) throw new TypeError('normalized attempt invalid');
      for(const key of ['attempt_coordinate','task_coordinate','implementation_coordinate','runtime_coordinate']) requireSha(attempt[key],key);
      if(typeof attempt.accepted_outcome!=='boolean') throw new TypeError('accepted_outcome invalid');
      if(!attempt.work||typeof attempt.work!=='object'||Array.isArray(attempt.work)) throw new TypeError('work invalid');
      if(seenAttempts.has(attempt.attempt_coordinate)) throw new TypeError('duplicate attempt_coordinate');
      seenAttempts.add(attempt.attempt_coordinate);
      discoveredTasks.add(attempt.task_coordinate);
      const selected=selectedByTask.get(attempt.task_coordinate)||[];
      if(selected.length<floor.minimum_attempts_per_task){
        selected.push(attempt);
        selectedByTask.set(attempt.task_coordinate,selected);
      }
    }
  }

  if(discoveredTasks.size!==floor.distinct_tasks) throw new TypeError('source task set does not match preregistered distinct task floor');
  const deficits=[...discoveredTasks].filter(t=>(selectedByTask.get(t)||[]).length<floor.minimum_attempts_per_task);
  if(deficits.length) throw new TypeError('chronological source sequence does not satisfy attempts-per-task floor');

  const selected=[...selectedByTask.entries()]
    .sort(([a],[b])=>a.localeCompare(b))
    .flatMap(([,attempts])=>attempts);
  if(selected.length!==floor.minimum_eligible_attempts) throw new TypeError('selected cohort does not equal preregistered minimum eligible attempts');

  const envelope={
    schema:'seenrelay-neutral-task-chronological-cohort-v1',
    workload_id:workloadId,
    source_sequence_fingerprint:sourceSequenceFingerprint,
    sampling_protocol_fingerprint:samplingProtocolFingerprint,
    source_evidence_proof_fingerprints:[...sourceProofs],
    selection_policy:'first_eligible_attempts_per_task_in_committed_source_order',
    distinct_tasks:discoveredTasks.size,
    attempts_per_task:floor.minimum_attempts_per_task,
    eligible_attempts:selected.length,
    normalized_attempts:selected,
  };
  return Object.freeze({
    ...envelope,
    evidence_class:'external_neutral_task_replay',
    counts_as_natural_evidence:false,
    counts_as_external_adoption:false,
    raw_task_ids_retained:false,
    raw_prompt_hashes_retained:false,
    source_payloads_retained:false,
    source_timestamps_retained:false,
    optimizer_authorized:false,
    production_change_authorized:false,
    proof_fingerprint:fp(envelope),
  });
}
