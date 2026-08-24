export function openApi(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'SeenRelay API', version: '0.3.0',
      description: 'Reusable information gain from source-backed observations made incidentally by AI agents. CHECK and OBSERVE remain the only domain operations. Fact identity v3 excludes mutable observed content; observer proofs establish key possession, not truth; Hive Leases provide frictionless free-bootstrap admission and delayed cross-client contribution rewards.'
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/v1/check': { post: {
        operationId: 'checkFactFreshness', summary: 'Check whether a known fact value has been observed recently',
        parameters: [{ name:'x-seenrelay-lease',in:'header',required:false,schema:{type:'string'},description:'Opaque signed Hive Lease. If omitted, SeenRelay issues or re-associates a lease without account authentication.' }],
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CheckRequest'}}}},
        responses:{'200':{description:'Freshness observation result plus Hive state'},'400':{description:'Invalid request'},'429':{description:'Free CHECK allowance is refilling'},'503':{description:'Temporarily controlled or unavailable'}}
      }},
      '/v1/observe': { post: {
        operationId:'observeFact',summary:'Contribute a fact observation obtained independently by the caller',
        parameters:[{name:'x-seenrelay-lease',in:'header',required:false,schema:{type:'string'},description:'Opaque signed Hive Lease. OBSERVE does not consume CHECK allowance.'}],
        requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/ObserveRequest'}}}},
        responses:{'200':{description:'Observation accepted or deduplicated plus Hive state'},'400':{description:'Invalid request'},'503':{description:'Temporarily controlled or unavailable'}}
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
      ObserveRequest:{type:'object',additionalProperties:false,required:['fact','value'],properties:{fact:{$ref:'#/components/schemas/FactDescriptor'},value:{},observed_at:{type:'string',format:'date-time'},observer_id:{type:'string',maxLength:128,description:'Self-asserted identity label. Unverified unless observer_proof is supplied.'},observer_proof:{$ref:'#/components/schemas/ObserverProof'},evidence_fingerprint:{type:'string',maxLength:256},idempotency_key:{type:'string',maxLength:128},source_validator:{type:'object',additionalProperties:false,required:['kind','value'],properties:{kind:{enum:['etag','last_modified','content_hash','other']},value:{type:'string',maxLength:512}}}}}
    }}
  };
}
