import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/landing.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/funnel.css',import.meta.url),'utf8');
const start='<section class="rv-shell rv-ecosystem" id="ecosystem"';
const end='<section class="rv-shell rv-section" id="how">';
const getSection=()=>{
  const first=landing.indexOf(start);
  const last=landing.indexOf(end);
  assert.ok(first>=0&&last>first,'existing home must include ecosystem section before how-it-works');
  return landing.slice(first,last);
};

test('homepage publishes exactly four independently inspectable discovery paths',()=>{
  const s=getSection();
  const links=[
    'https://registry.modelcontextprotocol.io/?q=io.github.ovladon%2Fseenrelay',
    'https://glama.ai/mcp/connectors/io.github.ovladon/seenrelay',
    'https://www.npmjs.com/package/seenrelay',
    'https://pypi.org/project/seenrelay/'
  ];
  assert.equal((s.match(/class="rv-ecosystem-card"/g)||[]).length,4);
  for(const url of links){
    assert.equal(s.split('href="'+url+'"').length-1,1,url);
  }
  assert.match(s,/MCP Registry/);
  assert.match(s,/Glama/);
  assert.match(s,/JAVASCRIPT · TYPESCRIPT/);
  assert.match(s,/PYTHON/);
  assert.match(s,/href="\/clients"/);
});

test('all outgoing directory/package cards open safely and have explicit accessible labels',()=>{
  const s=getSection();
  const cards=[...s.matchAll(/<a class="rv-ecosystem-card"([^>]+)>/g)];
  assert.equal(cards.length,4);
  for(const [,attrs] of cards){
    assert.match(attrs,/target="_blank"/);
    assert.match(attrs,/rel="noopener noreferrer"/);
    assert.match(attrs,/aria-label="[^"]+opens in a new tab[^"]*"/);
    assert.match(attrs,/href="https:\/\//);
  }
  assert.match(s,/aria-labelledby="rv-ecosystem-title"/);
  assert.match(s,/id="rv-ecosystem-title"/);
});

test('distribution discovery never claims an endorsement, certification or paid customer',()=>{
  const s=getSection();
  assert.match(s,/do not imply platform endorsement, security certification, external customer adoption/);
  assert.match(s,/permission to skip source validation/);
  assert.doesNotMatch(s,/<script\b|<iframe\b|<img\b/i,'no external scripts, frames or image pixels');
  assert.doesNotMatch(s,/trusted by|official partner|certified by|our customers/i);
  assert.match(landing,/local first/);
  assert.match(landing,/native controls first/);
});

test('ecosystem section remains keyboard accessible, responsive, and reduced-motion friendly',()=>{
  assert.match(landing,/<link rel="stylesheet" href="\/funnel.css">/);
  assert.match(css,/\.rv-ecosystem-card:focus-visible/);
  assert.match(css,/@media\(max-width:940px\)/);
  assert.match(css,/@media\(max-width:520px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
