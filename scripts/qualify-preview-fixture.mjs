import assert from 'node:assert/strict';

const url = 'https://seenrelay-git-preview-native-htt-6a17ce-ovladonn-9636s-projects.vercel.app/api/resource';
const expectedCommit = process.env.GITHUB_SHA;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const expectedRevision = 'preview-http-fixture-v1';
const originEtag = '"6e2a8e6f2f2939c870d0402c12ff212b37c3da4995c6c682229f39af306bf3e4"';
if (!expectedCommit) throw new Error('GITHUB_SHA is required');
if (!bypassSecret) throw new Error('VERCEL_AUTOMATION_BYPASS_SECRET is required');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchExact(headers = {}) {
  return fetch(url, {
    headers: {
      ...headers,
      'x-vercel-protection-bypass': bypassSecret
    },
    cache: 'no-store',
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000)
  });
}

function opaqueTag(etag) {
  return String(etag || '').replace(/^W\//, '');
}

function assertValidatorHeaders(response, observedEtag) {
  assert.equal(opaqueTag(response.headers.get('etag')), originEtag, 'ETag opaque value mismatch');
  if (observedEtag) assert.equal(response.headers.get('etag'), observedEtag, 'ETag changed within qualified deployment');
  assert.match(response.headers.get('vary') || '', /(?:^|,\s*)Accept(?:,|$)/i);
  assert.match(response.headers.get('cache-control') || '', /(?:^|,)\s*no-store\s*(?:,|$)/i);
}

function assertFullResponse(response, observedEtag) {
  assert.equal(response.headers.get('x-seenrelay-fixture-commit'), expectedCommit, 'deployment commit mismatch');
  assert.equal(response.headers.get('x-seenrelay-fixture-env'), 'preview', 'deployment environment mismatch');
  assert.equal(response.headers.get('x-seenrelay-fixture-revision'), expectedRevision, 'fixture revision mismatch');
  assertValidatorHeaders(response, observedEtag);
  const timing = response.headers.get('server-timing') || '';
  assert.match(timing, /(?:^|,\s*)app;dur=\d+(?:\.\d+)?(?:,|$)/);
  assert.match(timing, /(?:^|,\s*)cpu;dur=\d+(?:\.\d+)?(?:,|$)/);
  assert.equal(response.headers.has('set-cookie'), false, 'unexpected Set-Cookie');
}

function assertNotModified(response, observedEtag) {
  assert.equal(response.status, 304);
  assertValidatorHeaders(response, observedEtag);
}

let ready = false;
let lastStatus = 0;
let lastCommit = null;
for (let attempt = 0; attempt < 45; attempt += 1) {
  try {
    const response = await fetchExact({ accept: 'application/json' });
    lastStatus = response.status;
    lastCommit = response.headers.get('x-seenrelay-fixture-commit');
    if (response.status === 200 && lastCommit === expectedCommit) {
      ready = true;
      break;
    }
  } catch {
    // Deployment may still be becoming reachable.
  }
  await sleep(2_000);
}
assert.equal(ready, true, `Preview did not converge to exact commit; status=${lastStatus} commit=${lastCommit}`);

const json = await fetchExact({ accept: 'application/json' });
assert.equal(json.status, 200);
const jsonEtag = json.headers.get('etag');
assert.ok(jsonEtag, 'JSON ETag missing');
assertFullResponse(json, jsonEtag);
assert.match(json.headers.get('content-type') || '', /^application\/json/i);
const jsonBody = await json.json();
assert.equal(jsonBody.version, 1);
assert.equal(typeof jsonBody.payload, 'string');
assert.ok(jsonBody.payload.length >= 64 * 1024);

const text = await fetchExact({ accept: 'text/plain' });
assert.equal(text.status, 200);
const textEtag = text.headers.get('etag');
assert.ok(textEtag, 'text ETag missing');
assertFullResponse(text, textEtag);
assert.match(text.headers.get('content-type') || '', /^text\/plain/i);
assert.equal(await text.text(), 'version=1\n');

// Replay each validator exactly as observed, against the same negotiated representation.
const jsonConditional = await fetchExact({ accept: 'application/json', 'if-none-match': jsonEtag });
assertNotModified(jsonConditional, jsonEtag);
assert.equal(await jsonConditional.text(), '');

const textConditional = await fetchExact({ accept: 'text/plain', 'if-none-match': textEtag });
assertNotModified(textConditional, textEtag);
assert.equal(await textConditional.text(), '');

// If-None-Match requires weak comparison, so the strong equivalent must also validate.
const strongEquivalent = await fetchExact({ accept: 'application/json', 'if-none-match': originEtag });
assertNotModified(strongEquivalent, jsonEtag);

const wrong = await fetchExact({ accept: 'application/json', 'if-none-match': '"wrong-validator"' });
assert.equal(wrong.status, 200);
assertFullResponse(wrong, jsonEtag);

console.log(JSON.stringify({
  schema: 'seenrelay.preview-fixture-qualification.v3',
  qualified: true,
  commit: expectedCommit,
  environment: 'preview',
  resource_revision: expectedRevision,
  origin_etag: originEtag,
  observed_json_etag: jsonEtag,
  observed_text_etag: textEtag,
  observed_etag_strength: jsonEtag.startsWith('W/') ? 'weak' : 'strong',
  json_if_none_match_status: jsonConditional.status,
  text_if_none_match_status: textConditional.status,
  strong_equivalent_status: strongEquivalent.status,
  path: '/api/resource'
}, null, 2));
