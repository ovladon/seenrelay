import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const landing = fs.readFileSync(new URL('../src/landing.ts', import.meta.url), 'utf8');
const readinessClient = fs.readFileSync(new URL('../public/readiness.js', import.meta.url), 'utf8');
const revampClient = fs.readFileSync(new URL('../public/revamp.js', import.meta.url), 'utf8');
const funnelCss = fs.readFileSync(new URL('../public/funnel.css', import.meta.url), 'utf8');

test('homepage states the economic outcome immediately and makes self-serve local adoption primary', () => {
  assert.match(landing, /Decide when you actually need to look again\./);
  assert.match(landing, /measures what actually repeats/i);
  assert.match(landing, /Start locally/);
  assert.match(landing, /Install with an agent/);
  assert.match(landing, /publicProductFacts\.install\.scan_command/);
  assert.match(landing, /The scanner is a local prescreen, not a savings verdict/i);
  assert.match(landing, /Shadow measurement keeps the original authoritative call/i);
  assert.match(landing, /Controlled proof is not customer savings/i);
  assert.match(landing, /Currently free/i);
  assert.match(landing, /Savings Report/i);
  assert.match(landing, /not an invoice, bill, charge or payment receipt/i);
  assert.doesNotMatch(landing, /Commercial pilot/);
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

test('homepage keeps implementation detail off the human landing page', () => {
  assert.doesNotMatch(landing, /data-install-view="agent"/);
  assert.doesNotMatch(landing, /OPTIONAL PROTOCOL DEMO/);
  assert.doesNotMatch(landing, /live-check-form/);
  assert.match(landing, /href="\/quickstart"/);
  assert.match(landing, /href="\/clients"/);
  assert.match(revampClient, /navigator\.clipboard/);
});