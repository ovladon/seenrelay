import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const policyPath=new URL('../research/neutral-task-admission-v1.json',import.meta.url);
const amendmentPath=new URL('../research/neutral-task-admission-v1-amendment-001.json',import.meta.url);
const policy=JSON.parse(fs.readFileSync(policyPath,'utf8'));
const amendment=JSON.parse(fs.readFileSync(amendmentPath,'utf8'));
const policyFileSha=`sha256:${createHash('sha256').update(fs.readFileSync(policyPath)).digest('hex')}`;

test('original MCP preregistration remains frozen rather than rewritten after infrastructure invalids',()=>{
  assert.equal(policy.sample_floors['mcp-use-evals-v2'].selection,'all upstream scored tasks in the frozen baseline batch');
  assert.equal(amendment.original_policy_file_sha256,policyFileSha);
  assert.equal(amendment.original_preregistered_result_must_remain_reported_separately,true);
  assert.equal(amendment.original_preregistered_floor_may_not_be_relabelled_as_passed,true);
  assert.equal(amendment.counts_as_original_preregistered_confirmation,false);
});

test('pre-headroom completion amendment is outcome/work blind and authorizes nothing',()=>{
  assert.equal(amendment.frozen_before_any_headroom_measurement,true);
  assert.equal(amendment.completion_rule.selection_must_not_read_or_depend_on_accepted_outcome,true);
  assert.equal(amendment.completion_rule.selection_must_not_read_or_depend_on_work_metrics,true);
  assert.equal(amendment.completion_rule.use_next_naturally_scheduled_batch_in_chronological_order,true);
  assert.equal(amendment.headroom_measured,false);
  assert.equal(amendment.optimizer_authorized,false);
  assert.equal(amendment.attention_microkernel_authorized,false);
  assert.equal(amendment.production_change_authorized,false);
});
