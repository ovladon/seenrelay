import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalFactKey } from '../src/canonical';
import { hiveClass } from '../src/hive';

test('source-native locator remains the strongest identity discriminator', async () => {
  const base={source:'https://example.com/status',locator:{scheme:'element_id' as const,value:'service-status'}};
  const a=await canonicalFactKey({...base,subject:'Status A',predicate:'status.current'});
  const b=await canonicalFactKey({...base,subject:'Different description',predicate:'availability.current'});
  assert.equal(a.factKey,b.factKey); assert.equal(a.identityBasis,'source_locator');
});

test('no-locator fallback converges only through a shared predicate rather than mutable content', async () => {
  const a=await canonicalFactKey({subject:'Price shown today',predicate:'price.current',source:'https://example.com/pricing',qualifiers:{sku:'x'}});
  const b=await canonicalFactKey({subject:'Price changed tomorrow',predicate:'price.current',source:'https://example.com/pricing',qualifiers:{sku:'x'}});
  assert.equal(a.factKey,b.factKey); assert.equal(a.identityBasis,'predicate');
});

test('different predicates remain different facts without a source-native locator', async () => {
  const a=await canonicalFactKey({subject:'X',predicate:'price.current',source:'https://example.com/item'});
  const b=await canonicalFactKey({subject:'X',predicate:'availability.current',source:'https://example.com/item'});
  assert.notEqual(a.factKey,b.factKey);
});

test('Hive class is earned only from useful reuse, not raw activity', () => {
  assert.equal(hiveClass({useful_reuse_generated:0,contribution_score:999}),'new');
  assert.equal(hiveClass({useful_reuse_generated:1,contribution_score:1}),'established');
  assert.equal(hiveClass({useful_reuse_generated:10,contribution_score:10}),'contributor');
});
