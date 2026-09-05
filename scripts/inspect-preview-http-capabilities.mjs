import assert from 'node:assert/strict';

const BASE = process.env.SEENRELAY_PREVIEW_BASE;
const SHA = process.env.TARGET_PREVIEW_SHA;
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
if (!BASE || !SHA || !BYPASS) throw new Error('required environment is missing');

async function req(path='/api/resource', {method='GET', headers={}}={}) {
  return fetch(`${BASE}${path}`, {
    method,
    headers:{...headers,'x-vercel-protection-bypass':BYPASS},
    cache:'no-store',
    redirect:'manual',
    signal:AbortSignal.timeout(15000)
  });
}

const json = await req('/api/resource', {headers:{accept:'application/json'}});
assert.equal(json.status,200);
assert.equal(json.headers.get('x-seenrelay-fixture-commit'),SHA);
const etag=json.headers.get('etag');
assert.ok(etag);
const jsonText=await json.text();
const parsed=JSON.parse(jsonText);
assert.equal(parsed.version,1);
assert.ok(typeof parsed.payload==='string'&&parsed.payload.length>=64*1024);

const text=await req('/api/resource',{headers:{accept:'text/plain'}});
assert.equal(text.status,200);
assert.equal(text.headers.get('x-seenrelay-fixture-commit'),SHA);
const textEtag=text.headers.get('etag');
assert.ok(textEtag);
const textBody=await text.text();
assert.equal(textBody,'version=1\n');

const head=await req('/api/resource',{method:'HEAD',headers:{accept:'text/plain'}});
const headBody=await head.text();

const conditional=await req('/api/resource',{headers:{accept:'text/plain','if-none-match':textEtag}});
const conditionalBody=await conditional.text();

const conditionalHead=await req('/api/resource',{method:'HEAD',headers:{accept:'text/plain','if-none-match':textEtag}});
const conditionalHeadBody=await conditionalHead.text();

const range=await req('/api/resource',{headers:{accept:'application/json',range:'bytes=0-31'}});
const rangeBody=await range.text();

const digest=await req('/api/resource',{headers:{accept:'application/json','want-repr-digest':'sha-256=10','want-content-digest':'sha-256=10'}});
await digest.arrayBuffer();

const projection=await req('/api/resource?fields=version',{headers:{accept:'application/json'}});
const projectionText=await projection.text();
let projectionPayloadPresent=false;
try { projectionPayloadPresent=typeof JSON.parse(projectionText).payload==='string'; } catch {}

const perField=await req('/api/resource/version',{headers:{accept:'application/json'}});
await perField.arrayBuffer();

const result={
  schema:'seenrelay-preview-http-capabilities-v2',
  target_sha:SHA,
  full_json:{status:json.status,large_payload_present:true},
  compact_accept:{status:text.status,available:textBody==='version=1\n'},
  head_compact:{status:head.status,body_bytes:Buffer.byteLength(headBody),etag_present:Boolean(head.headers.get('etag'))},
  conditional_get_compact:{status:conditional.status,empty_body:conditionalBody.length===0},
  conditional_head_compact:{status:conditionalHead.status,empty_body:conditionalHeadBody.length===0,etag_present:Boolean(conditionalHead.headers.get('etag'))},
  last_modified_present:Boolean(json.headers.get('last-modified')),
  content_digest_present:Boolean(digest.headers.get('content-digest')),
  repr_digest_present:Boolean(digest.headers.get('repr-digest')),
  accept_ranges_present:Boolean(json.headers.get('accept-ranges')),
  range_request:{status:range.status,partial_content:range.status===206,body_bytes:Buffer.byteLength(rangeBody)},
  field_projection_query:{status:projection.status,payload_still_present:projectionPayloadPresent,body_bytes:Buffer.byteLength(projectionText)},
  per_field_endpoint:{status:perField.status,available:perField.status>=200&&perField.status<300},
  cache_control:json.headers.get('cache-control'),
  vary:json.headers.get('vary'),
  raw_auth_material_emitted:false
};
console.log(JSON.stringify(result,null,2));
