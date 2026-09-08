import { SERVICE_RELEASE } from './version.js';

export function openApi(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SeenRelay API', version: SERVICE_RELEASE,
      description: 'Reusable information gain from source-backed observations made incidentally by AI agents. CHECK and OBSERVE remain the only domain operations. CHECK can return observer-supplied source validators as revalidation hints; SeenRelay does not verify them. Fact identity v3 excludes mutable observed content; observer proofs establish key possession, not truth; Hive Leases provide frictionless free-bootstrap admission and delayed cross-client contribution rewards.'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/v1/check': { post: {
        operationId: 'checkFactFreshness', summary: 'Check whether a known fact value has been observed recently',
        parameters: [{ name:'x-seenrelay-lease',in:'header',required:false,schema:{type:'string'},description:'Opaque signed Hive Lease. If omitted, SeenRelay issues or re-associates a lease without account authentication.' }],
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CheckRequest'}}}},
        responses:{'200':{description:'Freshness result with bootstrap next-step guidance, optional observer-supplied source-validator hint, and Hive state'},'400':{description:'Invalid request'},'429':{description:'Free CHECK allowance is refilling'},'503':{description:'Temporarily controlled or unavailable'}}
      }},
      '/v1/observe': { post: {
        operationId:'observeFact',summary:'Contribute a fact observation obtained independently by the caller',
        parameters:[{name:'x-seenrelay-lease',in:'header',required:false,schema:{type:'string'},description:'Opaque signed Hive Lease. OBSERVE does not consume CHECK allowance.'}],
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ObserveRequest'}}}},
        responses:{'200':{description:'Observation accepted or deduplicated, future-CHECK eligibility, and Hive state'},'400':{description:'Invalid request'},'503':{description:'Temporarily controlled or unavailable'}}
      }},
      '/readiness/audit': { post: {
        operationId:'auditAiVisitReadiness',
        summary:'Run one bounded machine-readable audit of a public HTTPS site root',
        description:'Makes one bounded GET to the submitted public HTTPS origin. It does not crawl, authenticate, test conditional revalidation, or determine whether SeenRelay is a workload fit.',
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ReadinessAuditRequest'}}}},
        responses:{
          '200':{description:'Bounded readiness report. Surface findings never establish SeenRelay workload fit.',content:{'application/json':{schema:{$ref:'#/components/schemas/ReadinessReport'}}}},
          '400':{description:'Invalid site input.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}},
          '422':{description:'The bounded audit could not safely reach or evaluate the submitted public origin.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}}
        }
      }},
      '/readiness/audit/v2': { post: {
        operationId:'auditAiSiteReadinessV2',
        summary:'Run the activation-gated bounded AI-readiness v2 diagnostic',
        description:'When enabled, performs exactly six fixed same-origin HTTPS GET probes with one DNS pin, no credentials, no redirects, no retries and a 768 KiB aggregate response cap. Surface evidence never establishes SeenRelay workload fit.',
        'x-seenrelay-availability':'activation-gated',
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ReadinessAuditRequest'}}}},
        responses:{
          '200':{description:'Bounded v2 execution receipt and interpreted evidence.',content:{'application/json':{schema:{$ref:'#/components/schemas/ReadinessV2Audit'}}}},
          '400':{description:'Invalid request body.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}},
          '422':{description:'The target could not be safely admitted or evaluated.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}},
          '429':{description:'The bounded v2 capacity ceiling is exhausted.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}},
          '503':{description:'Readiness v2 is present but not enabled in this deployment.',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiError'}}}}
        }
      }}
    },
    components:{schemas:{
      FactLocator:{type:'object',additionalProperties:false,required:['scheme','value'],properties:{scheme:{enum:['json_pointer','element_id','source_key']},value:{type:'string',minLength:1,maxLength:1024}}},
      FactDescriptor:{type:'object',additionalProperties:false,required:['subject','predicate','source'],properties:{
        subject:{type:'string',maxLength:256,description:'Human-readable label. Excluded from canonical fact identity.'},
        predicate:{type:'string',maxLength:128,description:'Stable shared machine identifier. Used as the identity discriminator when locator is absent.'},
        qualifiers:{type:'object',additionalProperties:true,description:'Minimal semantic qualifiers needed to distinguish otherwise identical source-backed facts.'},
        source:{type:'string',format:'uri',pattern:'^https?://'},locator:{$ref:'#/components/schemas/FactLocator'}
      }},
      ObserverProof:{type:'object',additionalProperties:false,required:['scheme','public_key','timestamp','nonce','signature'],properties:{scheme:{const:'ed25519-v1'},public_key:{type:'string',description:'Raw 32-byte Ed25519 public key, unpadded base64url.'},timestamp:{type:'string',format:'date-time'},nonce:{type:'string',description:'16..64 random bytes, unpadded base64url.'},signature:{type:'string',description:'Raw 64-byte Ed25519 signature, unpadded base64url.'}}},
      CheckRequest:{type:'object',additionalProperties:false,required:['fact','known_value'],properties:{fact:{$ref:'#/components/schemas/FactDescriptor'},known_value:{},max_age_seconds:{type:'integer',minimum:1,maximum:604800,default:3600}}},
      ObserveRequest:{type:'object',additionalProperties:false,required:['fact','value'],properties:{fact:{$ref:'#/components/schemas/FactDescriptor'},value:{},observed_at:{type:'string',format:'date-time'},observer_id:{type:'string',maxLength:128,description:'Self-asserted identity label. Unverified unless observer_proof is supplied.'},observer_proof:{$ref:'#/components/schemas/ObserverProof'},evidence_fingerprint:{type:'string',maxLength:256},idempotency_key:{type:'string',maxLength:128},source_validator:{type:'object',additionalProperties:false,required:['kind','value'],description:'Optional observer-supplied validator metadata. Stored and returned as a hint; SeenRelay does not verify it against the source.',properties:{kind:{enum:['etag','last_modified','content_hash','other']},value:{type:'string',maxLength:512,pattern:'^[^\\r\\n]+$'}}}}},
      ReadinessAuditRequest:{type:'object',additionalProperties:false,required:['site'],properties:{site:{type:'string',minLength:1,maxLength:253,description:'Public DNS hostname or HTTPS origin. Paths, credentials, non-default ports, IP literals and local/internal hosts are rejected.'}}},
      ReadinessCheck:{type:'object',additionalProperties:false,required:['id','status','label','detail'],properties:{id:{type:'string'},status:{enum:['PASS','FIX','INFO']},label:{type:'string'},detail:{type:'string'}}},
      ReadinessEvidence:{type:'object',additionalProperties:false,required:['requested_origin','status','elapsed_ms','body_bytes_read','body_truncated','content_type','cache_control','etag_present','last_modified_present','vary_accept','machine_link_header_present','redirect_location'],properties:{
        requested_origin:{type:'string',format:'uri'},status:{type:'integer',minimum:0,maximum:599},elapsed_ms:{type:'number',minimum:0},body_bytes_read:{type:'integer',minimum:0,maximum:131072},body_truncated:{type:'boolean'},
        content_type:{anyOf:[{type:'string'},{type:'null'}]},cache_control:{anyOf:[{type:'string'},{type:'null'}]},etag_present:{type:'boolean'},last_modified_present:{type:'boolean'},vary_accept:{type:'boolean'},machine_link_header_present:{type:'boolean'},redirect_location:{anyOf:[{type:'string'},{type:'null'}]}
      }},
      ReadinessReport:{type:'object',additionalProperties:false,required:['schema','scope','target_origin','verdict','headline','evidence','checks','next_steps','limitations','seenrelay_candidate','seenrelay_recommendation'],properties:{
        schema:{const:'seenrelay-ai-visit-efficiency-quick-audit-v1'},scope:{const:'single-root-response'},target_origin:{type:'string',format:'uri'},verdict:{enum:['NATIVE_READY','NATIVE_FIX_RECOMMENDED','NEEDS_WORKLOAD_EVIDENCE']},headline:{type:'string'},evidence:{$ref:'#/components/schemas/ReadinessEvidence'},checks:{type:'array',items:{$ref:'#/components/schemas/ReadinessCheck'}},next_steps:{type:'array',items:{type:'string'}},limitations:{type:'array',items:{type:'string'}},seenrelay_candidate:{const:false},seenrelay_recommendation:{const:'NOT_DETERMINED_BY_SURFACE_SCAN'}
      }},
      ReadinessV2Dimension:{type:'object',additionalProperties:false,required:['status','evidence','detail'],properties:{status:{enum:['PASS','FIX','INFO','NOT_APPLICABLE']},evidence:{type:'boolean'},detail:{type:'string'}}},
      ReadinessV2ProbeEvidence:{type:'object',additionalProperties:false,required:['root','robots','sitemap','llmsTxt','openapi','a2aAgentCard','mcp','agentSkills','agentPayment'],properties:{
        root:{type:'object',additionalProperties:false,required:['success','machineLinkPresent','positiveFreshness','etagPresent','lastModifiedPresent'],properties:{success:{type:'boolean'},machineLinkPresent:{type:'boolean'},positiveFreshness:{type:'boolean'},etagPresent:{type:'boolean'},lastModifiedPresent:{type:'boolean'}}},
        robots:{type:'object',additionalProperties:false,required:['present'],properties:{present:{type:'boolean'}}},
        sitemap:{type:'object',additionalProperties:false,required:['present'],properties:{present:{type:'boolean'}}},
        llmsTxt:{type:'object',additionalProperties:false,required:['present'],properties:{present:{type:'boolean'}}},
        openapi:{type:'object',additionalProperties:false,required:['valid','operationCount','linkedFromRoot'],properties:{valid:{type:'boolean'},operationCount:{type:'integer',minimum:0},linkedFromRoot:{type:'boolean'}}},
        a2aAgentCard:{type:'object',additionalProperties:false,required:['valid','interfaceCount'],properties:{valid:{type:'boolean'},interfaceCount:{type:'integer',minimum:0}}},
        mcp:{type:'object',additionalProperties:false,required:['advertised'],properties:{advertised:{type:'boolean'}}},
        agentSkills:{type:'object',additionalProperties:false,required:['advertised'],properties:{advertised:{type:'boolean'}}},
        agentPayment:{type:'object',additionalProperties:false,required:['advertised'],properties:{advertised:{type:'boolean'}}}
      }},
      ReadinessV2Dimensions:{type:'object',additionalProperties:false,required:['publicHttpsRepresentation','machineDiscovery','machineContract','a2aDelegation','mcpDiscovery','nativeFreshness','crawlHints','agentInstructions','agentPayment'],properties:{
        publicHttpsRepresentation:{$ref:'#/components/schemas/ReadinessV2Dimension'},machineDiscovery:{$ref:'#/components/schemas/ReadinessV2Dimension'},machineContract:{$ref:'#/components/schemas/ReadinessV2Dimension'},a2aDelegation:{$ref:'#/components/schemas/ReadinessV2Dimension'},mcpDiscovery:{$ref:'#/components/schemas/ReadinessV2Dimension'},nativeFreshness:{$ref:'#/components/schemas/ReadinessV2Dimension'},crawlHints:{$ref:'#/components/schemas/ReadinessV2Dimension'},agentInstructions:{$ref:'#/components/schemas/ReadinessV2Dimension'},agentPayment:{$ref:'#/components/schemas/ReadinessV2Dimension'}
      }},
      ReadinessV2Report:{type:'object',additionalProperties:false,required:['protocol','scope','targetOrigin','verdict','verifiedMachineSurfaces','dimensions','nextSteps','limitations','seenrelayCandidate','seenrelayRecommendation'],properties:{
        protocol:{const:'seenrelay-ai-site-readiness-v2'},scope:{const:'bounded_machine_surface_classification'},targetOrigin:{type:'string',format:'uri'},verdict:{enum:['MACHINE_READY','PARTIAL_MACHINE_READY','NATIVE_FIX_RECOMMENDED','INCONCLUSIVE']},verifiedMachineSurfaces:{type:'array',uniqueItems:true,items:{enum:['OPENAPI','A2A']}},dimensions:{$ref:'#/components/schemas/ReadinessV2Dimensions'},nextSteps:{type:'array',items:{type:'string'}},limitations:{type:'array',items:{type:'string'}},seenrelayCandidate:{const:false},seenrelayRecommendation:{const:'REQUIRES_OWNER_WORKLOAD_EVIDENCE'}
      }},
      ReadinessV2Evidence:{type:'object',additionalProperties:false,required:['protocol','origin','probes','report'],properties:{protocol:{const:'seenrelay-site-audit-interpreted-evidence-v2'},origin:{type:'string',format:'uri'},probes:{$ref:'#/components/schemas/ReadinessV2ProbeEvidence'},report:{$ref:'#/components/schemas/ReadinessV2Report'}}},
      ReadinessV2Audit:{type:'object',additionalProperties:false,required:['protocol','requestCount','retries','totalMaxBytes','evidence'],properties:{protocol:{const:'seenrelay-site-audit-execution-v2'},requestCount:{const:6},retries:{const:0},totalMaxBytes:{const:786432},evidence:{$ref:'#/components/schemas/ReadinessV2Evidence'}}},
      ApiError:{type:'object',additionalProperties:false,required:['error'],properties:{error:{type:'object',additionalProperties:false,required:['code','detail'],properties:{code:{type:'string'},detail:{type:'string'}}}}}
    }}
  };
}
