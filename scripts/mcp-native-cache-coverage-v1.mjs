const MARGINAL_FLOOR_PERCENT = 20;
const ACTIVE_PROTOTYPE_PERCENT = 30;

function n(v,name){if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw new TypeError(`${name} must be finite non-negative number`);return v;}

/**
 * Measures how much input-token volume is already handled by provider-native prompt caching.
 * This is descriptive native-first evidence. It does not infer prices, compute savings,
 * network-byte savings, outcome equivalence, or eliminability of cached tokens.
 */
export function evaluateMcpNativeCacheCoverage(traces){
  if(!Array.isArray(traces)||!traces.length)throw new TypeError('traces must be non-empty array');
  let input=0,noCache=0,cacheRead=0,cacheWrite=0;
  for(let i=0;i<traces.length;i++){
    const t=traces[i];
    if(!t||typeof t!=='object'||Array.isArray(t)||t.schema!=='seenrelay-mcp-use-evals-structural-trace-v1')throw new TypeError(`traces[${i}] invalid`);
    const w=t.final_result_work;if(!w||typeof w!=='object'||Array.isArray(w))throw new TypeError(`traces[${i}].final_result_work invalid`);
    const a=n(w.input_tokens,`traces[${i}].input_tokens`),b=n(w.no_cache_input_tokens,`traces[${i}].no_cache_input_tokens`),c=n(w.cache_read_input_tokens,`traces[${i}].cache_read_input_tokens`),d=n(w.cache_write_input_tokens,`traces[${i}].cache_write_input_tokens`);
    if(Math.abs(a-(b+c+d))>1e-9)throw new TypeError(`traces[${i}] input-token accounting mismatch`);
    input+=a;noCache+=b;cacheRead+=c;cacheWrite+=d;
  }
  if(input<=0)throw new TypeError('aggregate input tokens must be positive');
  const nativeCoverage=cacheRead/input*100;
  const nonReadVolume=noCache+cacheWrite;
  const remaining=nonReadVolume/input*100;
  return Object.freeze({
    schema:'seenrelay-mcp-native-cache-coverage-v1',
    attempts:traces.length,
    input_tokens:input,
    no_cache_input_tokens:noCache,
    cache_read_input_tokens:cacheRead,
    cache_write_input_tokens:cacheWrite,
    provider_native_cache_read_coverage_percent:nativeCoverage,
    non_cache_read_input_tokens:nonReadVolume,
    additional_prompt_cache_conversion_upper_bound_percent_of_input_tokens:remaining,
    private255_marginal_headroom_floor_percent:MARGINAL_FLOOR_PERCENT,
    private255_active_prototype_headroom_percent:ACTIVE_PROTOTYPE_PERCENT,
    additional_prompt_cache_family_below_marginal_floor:remaining<MARGINAL_FLOOR_PERCENT,
    additional_prompt_cache_family_active_prototype_candidate:false,
    economic_value_proven:false,
    network_transfer_savings_proven:false,
    cached_token_elimination_proven:false,
    outcome_equivalence_proven:false,
    optimizer_authorized:false,
    attention_microkernel_authorized:false,
    production_change_authorized:false,
  });
}
