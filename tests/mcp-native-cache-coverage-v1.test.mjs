import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMcpNativeCacheCoverage } from '../scripts/mcp-native-cache-coverage-v1.mjs';
const trace=(input,noCache,read,write=0)=>({schema:'seenrelay-mcp-use-evals-structural-trace-v1',final_result_work:{input_tokens:input,no_cache_input_tokens:noCache,cache_read_input_tokens:read,cache_write_input_tokens:write}});
test('reports native coverage and bounded remaining prompt-cache conversion volume',()=>{
 const out=evaluateMcpNativeCacheCoverage([trace(100,6,94),trace(200,12,188)]);
 assert.equal(out.input_tokens,300);assert.equal(out.cache_read_input_tokens,282);
 assert.equal(out.provider_native_cache_read_coverage_percent,94);
 assert.equal(out.additional_prompt_cache_conversion_upper_bound_percent_of_input_tokens,6);
 assert.equal(out.additional_prompt_cache_family_below_marginal_floor,true);
 assert.equal(out.additional_prompt_cache_family_active_prototype_candidate,false);
 assert.equal(out.economic_value_proven,false);assert.equal(out.optimizer_authorized,false);
});
test('counts cache-write volume as non-cache-read upper-bound volume',()=>{
 const out=evaluateMcpNativeCacheCoverage([trace(100,5,90,5)]);
 assert.equal(out.provider_native_cache_read_coverage_percent,90);
 assert.equal(out.non_cache_read_input_tokens,10);
 assert.equal(out.additional_prompt_cache_conversion_upper_bound_percent_of_input_tokens,10);
});
test('rejects incomplete or inconsistent native cache accounting',()=>{
 assert.throws(()=>evaluateMcpNativeCacheCoverage([{schema:'seenrelay-mcp-use-evals-structural-trace-v1',final_result_work:{input_tokens:100,no_cache_input_tokens:null,cache_read_input_tokens:90,cache_write_input_tokens:0}}]),/no_cache/);
 assert.throws(()=>evaluateMcpNativeCacheCoverage([trace(100,5,90)]),/accounting mismatch/);
});
test('does not convert coverage into economic or outcome claims',()=>{
 const out=evaluateMcpNativeCacheCoverage([trace(100,50,50)]);
 assert.equal(out.economic_value_proven,false);assert.equal(out.network_transfer_savings_proven,false);assert.equal(out.cached_token_elimination_proven,false);assert.equal(out.outcome_equivalence_proven,false);assert.equal(out.attention_microkernel_authorized,false);
});
