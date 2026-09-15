import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('main deployment has a conservative ignored-build guardrail',()=>{
  const config=JSON.parse(read('vercel.json'));
  const script=read('scripts/vercel-ignore-main.sh');
  assert.equal(config.ignoreCommand,'bash scripts/vercel-ignore-main.sh');
  assert.match(script,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(script,/Fail open/);
  assert.match(script,/src\//);
  assert.match(script,/public\//);
  assert.match(script,/vercel\.json/);
  assert.doesNotMatch(script,/tests\//);
  assert.doesNotMatch(script,/docs\//);
});

test('readiness deployment skips unrelated repository changes',()=>{
  const config=JSON.parse(read('deploy/readiness/vercel.json'));
  const script=read('scripts/vercel-ignore-readiness.sh');
  assert.equal(config.ignoreCommand,'bash ../../scripts/vercel-ignore-readiness.sh');
  assert.match(script,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(script,/deploy\/readiness\//);
  assert.match(script,/src\//);
  assert.match(script,/public\/\(revamp/);
  assert.doesNotMatch(script,/tests\//);
  assert.doesNotMatch(script,/docs\//);
});
