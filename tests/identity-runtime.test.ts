import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFactKey, normalizeLocator, normalizeSource, stableJson, ValidationError } from '../src/canonical';
import { deriveClientKey, deriveObserverIdentity, deriveReuseIndependenceKey, observerProofSigningPayload } from '../src/identity';
import type { ObserveRequest, ObserverProof } from '../src/types';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let binary='';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
}

test('fact identity converges across descriptive subject/predicate differences when locator is stable', async () => {
  const a=await canonicalFactKey({subject:'Model X price',predicate:'price.input_usd',qualifiers:{Tier:'standard'},source:'https://EXAMPLE.com:443/pricing?utm_source=agent&b=2&a=1#section',locator:{scheme:'element_id',value:'model-x-input-price'}});
  const b=await canonicalFactKey({subject:'Input cost for Model X',predicate:'commerce.price',qualifiers:{tier:'standard'},source:'https://example.com/pricing?a=1&b=2',locator:{scheme:'element_id',value:'model-x-input-price'}});
  assert.equal(a.factKey,b.factKey); assert.equal(a.identityVersion,'seenrelay-fact-v3'); assert.equal(a.sourceUrl,'https://example.com/pricing?a=1&b=2');
});

test('without locator, predicate remains identity-bearing while subject does not', async () => {
  const base={qualifiers:{tier:'standard'},source:'https://example.com/pricing'};
  const a=await canonicalFactKey({...base,subject:'A label',predicate:'price.current'});
  const b=await canonicalFactKey({...base,subject:'Another label',predicate:'price.current'});
  const c=await canonicalFactKey({...base,subject:'A label',predicate:'availability.current'});
  assert.equal(a.factKey,b.factKey); assert.notEqual(a.factKey,c.factKey);
});

test('mutable observed content is not accepted as a fact identity anchor', async () => {
  const base:any={subject:'Price',predicate:'price.current',source:'https://example.com/pricing'};
  const a=await canonicalFactKey(base); const b=await canonicalFactKey({...base,subject:'Changed price label'});
  assert.equal(a.factKey,b.factKey); assert.equal(a.identityBasis,'predicate');
  assert.equal('anchor' in a,false);
});

test('source canonicalization strips tracking but rejects authentication and signature material', () => {
  assert.equal(normalizeSource('https://Example.com/item?utm_campaign=x&z=9&a=1#frag'),'https://example.com/item?a=1&z=9');
  assert.throws(()=>normalizeSource('https://user:pass@example.com/item'),ValidationError);
  assert.throws(()=>normalizeSource('https://example.com/item?access_token=secret&a=1'),ValidationError);
  assert.throws(()=>normalizeSource('https://example.com/item?X-Amz-Signature=secret'),ValidationError);
});

test('source-native locator values are preserved exactly', () => {
  assert.deepEqual(normalizeLocator({scheme:'json_pointer',value:'/items/a '}),{scheme:'json_pointer',value:'/items/a '});
  assert.notDeepEqual(normalizeLocator({scheme:'source_key',value:'Ａ'}),{scheme:'source_key',value:'A'});
});

test('canonical JSON rejects unpaired Unicode surrogates', () => {
  assert.throws(()=>stableJson({value:'\ud800'}),/unpaired Unicode surrogate/); assert.doesNotThrow(()=>stableJson({value:'😀'}));
});

test('platform forwarded hint contributes to client continuity', async () => {
  process.env.PRIVACY_SALT='test-privacy-salt-that-is-longer-than-thirty-two-characters';
  const a=new Request('https://seenrelay.test',{headers:{'x-forwarded-for':'1.2.3.4','user-agent':'agent','x-seenrelay-client':'install-1'}});
  const b=new Request('https://seenrelay.test',{headers:{'x-forwarded-for':'1.2.3.4','user-agent':'agent','x-seenrelay-client':'install-1'}});
  const c=new Request('https://seenrelay.test',{headers:{'x-forwarded-for':'8.8.8.8','user-agent':'agent','x-seenrelay-client':'install-1'}});
  assert.equal(await deriveClientKey(a),await deriveClientKey(b));
  assert.notEqual(await deriveClientKey(a),await deriveClientKey(c));
});



test('server-verified first-party telemetry marker changes only operational classification', async () => {
  const oldSecret=process.env.INTERNAL_TELEMETRY_SECRET;
  const oldSalt=process.env.PRIVACY_SALT;
  try {
    process.env.PRIVACY_SALT='test-privacy-salt-that-is-longer-than-thirty-two-characters';
    process.env.INTERNAL_TELEMETRY_SECRET='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const nowMs=1788080400000;
    const marker='v1.1788080400.5Sd_eSTFRVwUAJXLENmdOaEa0zoXsNTF5D2SyNjtR1o';
    const common={
      'x-forwarded-for':'203.0.113.4',
      'user-agent':'SeenRelay-Operator-Probe/1',
      'x-seenrelay-client':'operator-probe'
    };
    const ordinary=new Request('https://seenrelay.test/v1/check',{method:'POST',headers:common});
    const marked=new Request('https://seenrelay.test/v1/check',{method:'POST',headers:{...common,'x-seenrelay-internal-telemetry':marker}});
    const wrongPath=new Request('https://seenrelay.test/v1/observe',{method:'POST',headers:{...common,'x-seenrelay-internal-telemetry':marker}});
    const stale=new Request('https://seenrelay.test/v1/check',{method:'POST',headers:{...common,'x-seenrelay-internal-telemetry':'v1.1788070000.5Sd_eSTFRVwUAJXLENmdOaEa0zoXsNTF5D2SyNjtR1o'}});

    // Patch Date.now only for the classifier's default clock while preserving caller behavior.
    const realNow=Date.now;
    Date.now=()=>nowMs;
    try {
      assert.match(await deriveClientKey(ordinary),/^client:/);
      assert.match(await deriveClientKey(marked),/^internal:/);
      assert.match(await deriveClientKey(wrongPath),/^client:/);
      assert.match(await deriveClientKey(stale),/^client:/);
      assert.equal(await deriveReuseIndependenceKey(ordinary),await deriveReuseIndependenceKey(marked));
      const observer=await deriveObserverIdentity(marked,{fact:{subject:'X',predicate:'status.current',source:'https://example.com/status'},value:'ok'},nowMs,300);
      assert.equal(observer.kind,'anonymous_network_hint');
      assert.match(observer.key,/^anon:/);
    } finally {
      Date.now=realNow;
    }
  } finally {
    if (oldSecret === undefined) delete process.env.INTERNAL_TELEMETRY_SECRET; else process.env.INTERNAL_TELEMETRY_SECRET=oldSecret;
    if (oldSalt === undefined) delete process.env.PRIVACY_SALT; else process.env.PRIVACY_SALT=oldSalt;
  }
});

test('valid Ed25519 proof establishes proof-of-possession identity and tampering fails', async () => {
  process.env.PRIVACY_SALT='test-privacy-salt-that-is-longer-than-thirty-two-characters';
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']); const rawPublic=await crypto.subtle.exportKey('raw',pair.publicKey);
  const proofBase:Omit<ObserverProof,'signature'>={scheme:'ed25519-v1',public_key:b64url(rawPublic),timestamp:new Date().toISOString(),nonce:b64url(crypto.getRandomValues(new Uint8Array(24)))};
  const unsigned:ObserveRequest={fact:{subject:'Example status',predicate:'status.current',source:'https://example.com/status',locator:{scheme:'element_id',value:'status'}},value:'operational',observed_at:new Date().toISOString(),observer_id:'agent-installation-1'};
  const signature=await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(observerProofSigningPayload(unsigned,proofBase)));
  const signed:ObserveRequest={...unsigned,observer_proof:{...proofBase,signature:b64url(signature)}};
  const identity=await deriveObserverIdentity(undefined,signed,Date.now(),300);
  assert.equal(identity.kind,'cryptographic_key'); assert.equal(identity.assurance,'proof_of_possession'); assert.match(identity.key,/^ed25519:[0-9a-f]{64}$/); assert.match(identity.proofFingerprint||'',/^[0-9a-f]{64}$/);
  await assert.rejects(()=>deriveObserverIdentity(undefined,{...signed,value:'degraded'},Date.now(),300),/signature is invalid/);
});

test('expired observer proof is rejected before it can contribute provenance', async () => {
  process.env.PRIVACY_SALT='test-privacy-salt-that-is-longer-than-thirty-two-characters';
  const pair=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']); const rawPublic=await crypto.subtle.exportKey('raw',pair.publicKey);
  const proofBase:Omit<ObserverProof,'signature'>={scheme:'ed25519-v1',public_key:b64url(rawPublic),timestamp:new Date(Date.now()-10*60_000).toISOString(),nonce:b64url(crypto.getRandomValues(new Uint8Array(24)))};
  const unsigned:ObserveRequest={fact:{subject:'X',predicate:'status.current',source:'https://example.com/status'},value:'ok'};
  const signature=await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(observerProofSigningPayload(unsigned,proofBase)));
  await assert.rejects(()=>deriveObserverIdentity(undefined,{...unsigned,observer_proof:{...proofBase,signature:b64url(signature)}},Date.now(),300),/within 300s/);
});
