import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const factualCss = fs.readFileSync(new URL('../public/revamp-factual.css', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('factual homepage keeps small technical text legible', () => {
  for (const expected of [
    '.rv-kicker,.rv-eyebrow{font-size:12px',
    '.rv-flow-list small{font-size:13px',
    '.rv-code pre{font-size:13px',
    '.rv-card p{font-size:14px',
    '.rv-evidence-metrics span{font-size:12px',
    '.rv-evidence-interpretation p{font-size:13px',
    '.rv-footer{font-size:12px'
  ]) {
    assert.match(factualCss, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('non-product research and verification branches do not create Vercel previews', () => {
  assert.equal(vercel.git?.deploymentEnabled?.['research/**'], false);
  assert.equal(vercel.git?.deploymentEnabled?.['verify/**'], false);
  assert.equal(vercel.git?.deploymentEnabled?.['site/**'], undefined);
  assert.equal(vercel.git?.deploymentEnabled?.['release/**'], undefined);
});
