import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');
const readinessClient = fs.readFileSync(new URL('../public/readiness.js', import.meta.url), 'utf8');
const funnelCss = fs.readFileSync(new URL('../public/funnel.css', import.meta.url), 'utf8');

test('homepage keeps the runtime primary while routing site owners to the separate diagnostic tool', () => {
  assert.match(landing, /Run the free shadow audit/);
  assert.match(landing, /The easiest path is to give SeenRelay to your coding agent/);
  assert.match(landing, /SEPARATE FREE TOOL/);
  assert.match(landing, /Own a site or API\?/);
  assert.match(landing, /href="\/readiness"/);
  assert.match(landing, /href="#start"/);
  assert.match(landing, /It is separate from the SeenRelay runtime product/i);
});

test('readiness result handoff is conditional rather than a universal SeenRelay CTA', () => {
  assert.match(readinessClient, /report\.verdict === 'NATIVE_READY'/);
  assert.match(readinessClient, /report\.verdict === 'NATIVE_FIX_RECOMMENDED'/);
  assert.match(readinessClient, /This surface result is not a SeenRelay recommendation/);
  assert.match(readinessClient, /do not add SeenRelay just because this quick audit found a gap/i);
  assert.match(readinessClient, /A surface scan cannot decide SeenRelay workload fit/);
  assert.match(readinessClient, /action\.href = '\/#start'/);
});

test('intent router is responsive without adding a UI dependency', () => {
  assert.match(landing, /href="\/funnel\.css"/);
  assert.match(funnelCss, /\.rv-path-grid/);
  assert.match(funnelCss, /@media\(max-width:860px\)/);
  assert.match(funnelCss, /@media\(max-width:680px\)/);
});

test('homepage hero typography is bounded by both viewport width and height', () => {
  assert.match(funnelCss, /\.rv-funnel-hero h1\{[^}]*font-size:clamp\(38px,min\(4\.8vw,7\.2vh\),64px\)/);
  assert.match(funnelCss, /@media\(max-height:700px\) and \(min-width:681px\)/);
  assert.match(funnelCss, /font-size:clamp\(32px,10vw,42px\)/);
});
