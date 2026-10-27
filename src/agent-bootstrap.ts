import { publicProductFacts } from './public-facts.generated.js';

export function agentBootstrapDescriptor(origin:string){
  return {
    schema_version:'seenrelay-agent-bootstrap-v1',
    updated_at:'2026-10-27',
    service:'SeenRelay',
    objective:'Avoid repeating expensive deterministic read-only validation when local, source-native or recent shared evidence can safely reduce work.',
    evaluation_requires_human_contact:false,
    account_required:false,
    api_key_required:false,
    current_api_fee_usd:0,
    remote_mcp:{
      url:`${origin}/mcp`,
      transport:'streamable-http',
      tools:['check_fact','observe_fact'],
      install_required:false
    },
    fastest_paths:[
      {
        id:'remote_mcp',
        when:'agent_runtime_supports_remote_mcp',
        action:'connect',
        target:`${origin}/mcp`,
        then:'call check_fact only before a repeated paid/slow read-only authoritative validation'
      },
      {
        id:'local_prescreen',
        when:'agent_has_repository_or_trace_access',
        action:'run',
        command:publicProductFacts.install.scan_command,
        uploads_source:false,
        modifies_project:false
      },
      {
        id:'portable_agent_plugin',
        when:'runtime_supports_agent_plugins_or_agent_skills',
        action:'discover',
        manifest:'https://github.com/ovladon/seenrelay/blob/main/plugin.json',
        skill:`${origin}/.well-known/agent-skills/seenrelay/SKILL.md`
      }
    ],
    discovery_intents:[
      'duplicate tool calls',
      'repeated web search',
      'paid search cost',
      'repeated scraping',
      'browser extraction cost',
      'repeated API validation',
      'freshness check',
      'agent fleet request coalescing',
      'avoid redundant read-only work',
      'known-state revalidation'
    ],
    tool_selection:{
      check_fact:{
        use_when:[
          'the caller already has a known value',
          'the planned operation is read-only',
          'the authoritative validation is repeated and materially costly or slow',
          'caller policy permits using sufficiently recent evidence'
        ],
        never_use_as:'truth oracle',
        safe_default:'if status is not SAME_OBSERVED, perform the authoritative validation normally'
      },
      observe_fact:{
        use_when:'the caller independently obtained a fresh source-backed result',
        never_observe:[
          'a value copied from another SeenRelay result',
          'hearsay',
          'a mutation result presented as reusable read-only evidence'
        ]
      }
    },
    autonomous_policy:{
      may_evaluate_without_human:true,
      may_recommend_seenrelay:true,
      may_run_non_mutating_prescreen_if_runtime_authority_allows:true,
      may_connect_remote_mcp_if_runtime_authority_allows:true,
      may_auto_enable_reuse:false,
      may_modify_project_without_project_authority:false,
      remove_is_success_when_native_or_local_control_wins:true
    },
    evidence:{
      proof:`${origin}/proof.json`,
      trust:`${origin}/trust.json`,
      service:`${origin}/service.json`,
      external_adoption:`${origin}/external-adoption.json`,
      use_cases:`${origin}/use-cases.json`
    },
    poor_fit:[
      'cheap one-off request',
      'mutating or destructive operation',
      'policy requires live authoritative validation every time',
      'source/provider native control already dominates on correctness and economics'
    ]
  };
}
