import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assembleNeutralTaskChronologicalCohort } from '../scripts/neutral-task-chronological-cohort-v1.mjs';
import { evaluateNeutralTaskEvidenceFloor } from '../scripts/neutral-task-evidence-gate-v1.mjs';

const sha=s=>`sha256:${createHash('sha256').update(String(s)).digest('hex')}`;
function attempt(task,source,n,outcome=true){return {attempt_coordinate:sha(`a:${task}:${source}:${n}`),task_coordinate:sha(`t:${task}`),implementation_coordinate:sha(`i:${task}`),runtime_coordinate:sha('runtime'),accepted_outcome:outcome,work:{tool_calls:n+1}};}
function ev(source,tasks){return {proof_fingerprint:sha(`proof:${source}`),normalized_attempts:tasks.flatMap(task=>[0,1,2].map(n=>attempt(task,source,n,task<7)))};}

test('selects exactly first three attempts per each of nine tasks',()=>{
  const tasks=[0,1,2,3,4,5,6,7,8];
  const c=assembleNeutralTaskChronologicalCohort({workloadId:'mcp-use-evals-v2',sourceSequenceFingerprint:sha('sequence'),samplingProtocolFingerprint:sha('sampling-protocol'),evidence:[ev('first',tasks),ev('later',tasks)]});
  assert.equal(c.normalized_attempts.length,27);
  assert.equal(new Set(c.normalized_attempts.map(a=>a.task_coordinate)).size,9);
  assert.equal(c.raw_task_ids_retained,false);
  assert.equal(c.source_payloads_retained,false);
  const floor=evaluateNeutralTaskEvidenceFloor(c,'mcp-use-evals-v2');
  assert.equal(floor.sample_floor_met,true);
  assert.equal(floor.eligible_attempts,27);
  assert.equal(floor.minimum_attempts_observed_per_task,3);
});

test('later attempts cannot replace already selected earlier attempts',()=>{
  const tasks=[0,1,2,3,4,5,6,7,8];
  const first=ev('first',tasks),later=ev('later',tasks);
  const c=assembleNeutralTaskChronologicalCohort({workloadId:'mcp-use-evals-v2',sourceSequenceFingerprint:sha('sequence'),samplingProtocolFingerprint:sha('sampling-protocol'),evidence:[first,later]});
  const chosen=new Set(c.normalized_attempts.map(a=>a.attempt_coordinate));
  for(const a of first.normalized_attempts) assert.equal(chosen.has(a.attempt_coordinate),true);
  for(const a of later.normalized_attempts) assert.equal(chosen.has(a.attempt_coordinate),false);
});

test('rejects duplicate attempts',()=>{
  const tasks=[0,1,2,3,4,5,6,7,8];
  const first=ev('first',tasks);
  assert.throws(()=>assembleNeutralTaskChronologicalCohort({workloadId:'mcp-use-evals-v2',sourceSequenceFingerprint:sha('sequence'),samplingProtocolFingerprint:sha('sampling-protocol'),evidence:[first,first]}),/duplicate attempt_coordinate/);
});

test('rejects a source task set that does not equal preregistered task count',()=>{
  const tasks=[0,1,2,3,4,5,6,7];
  assert.throws(()=>assembleNeutralTaskChronologicalCohort({workloadId:'mcp-use-evals-v2',sourceSequenceFingerprint:sha('sequence'),samplingProtocolFingerprint:sha('sampling-protocol'),evidence:[ev('first',tasks)]}),/distinct task floor/);
});

test('rejects insufficient attempts for any task',()=>{
  const tasks=[0,1,2,3,4,5,6,7,8];
  const e=ev('first',tasks);
  e.normalized_attempts=e.normalized_attempts.filter(a=>a.task_coordinate!==sha('t:8')||!a.attempt_coordinate.endsWith('0'));
  e.normalized_attempts=e.normalized_attempts.filter(a=>a.task_coordinate!==sha('t:8'));
  e.normalized_attempts.push(attempt(8,'first',0),attempt(8,'first',1));
  assert.throws(()=>assembleNeutralTaskChronologicalCohort({workloadId:'mcp-use-evals-v2',sourceSequenceFingerprint:sha('sequence'),samplingProtocolFingerprint:sha('sampling-protocol'),evidence:[e]}),/attempts-per-task floor/);
});
