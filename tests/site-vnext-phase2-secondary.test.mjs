import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

const secondary=[
  'src/langfuse.ts',
  'src/substrate.ts',
  'src/quickstart.ts',
  'src/integrations.ts',
  'src/seo-pages.ts',
  'src/economics.ts',
  'src/fleet.ts',
  'src/trust.ts'
].map(read).join('\n');

test('secondary public surfaces use the self-serve vNext funnel rather than pilot navigation',()=>{
  assert.doesNotMatch(secondary,/href="\/commercial"|Commercial pilot|COMMERCIAL PILOT|Run free audit/i);
  assert.match(secondary,/Start locally/);
  assert.match(secondary,/href="\/clients"/);
  assert.match(secondary,/href="\/fleet"/);
  assert.match(secondary,/href="\/trust"/);
});

test('machine discovery no longer promotes commercial support as an adoption path',()=>{
  const adoption=read('src/adoption.ts');
  assert.doesNotMatch(adoption,/path: '\/commercial'|Commercial pilots:/);
  assert.match(adoption,/Start locally:/);
  assert.match(adoption,/Shadow measurement method:/);
});

test('legacy commercial route remains direct-only optional support',()=>{
  const commercial=read('src/commercial.ts');
  assert.match(commercial,/noindex,nofollow,noarchive/);
  assert.match(commercial,/SeenRelay is self-serve by default/i);
  assert.match(commercial,/Start self-serve\. Ask for help only if useful\./);
  assert.match(commercial,/not required to use SeenRelay/i);
  assert.match(commercial,/deployment-support\.yml/);
  assert.doesNotMatch(commercial,/pilot|commercial-pilot\.yml/i);
});

test('shared footer offers support without making pilot participation a product step',()=>{
  const view=read('src/public-facts-view.ts');
  assert.match(view,/Questions \/ support/);
  assert.doesNotMatch(view,/Questions \/ pilot/);
});

test('Quickstart client labels derive from verified public facts',()=>{
  const quickstart=read('src/quickstart.ts');
  assert.match(quickstart,/const clientVersion = publicProductFacts\.install\.client_version/);
  assert.match(quickstart,/CLIENT \$\{esc\(clientVersion\)\}/);
  assert.doesNotMatch(quickstart,/CLIENT 0\.2\.\d+\+/);
});
