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
      ApiError:{type:'object',additionalProperties:false,required:['error'],properties:{error:{type:'object',additionalProperties:false,required:['code','detail'],properties:{code:{type:'string'},detail:{type:'string'}}}}}
    }}
  };
}
