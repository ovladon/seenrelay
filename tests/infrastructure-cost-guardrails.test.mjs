import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read=(p)=>fs.readFileSync(p,'utf8');

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

function readinessRelativeDependencyClosure(entry){
  const seen=new Set();
  const queue=[entry];
  while(queue.length){
    const current=queue.shift();
    if(seen.has(current)) continue;
    seen.add(current);
    const source=read(current);
    const re=/from\s+['"](\.{1,2}\/[^'"]+)['"]/g;
    let match;
    while((match=re.exec(source))){
      let resolved=path.posix.normalize(path.posix.join(path.posix.dirname(current),match[1]));
      if(resolved.endsWith('.js')) resolved=resolved.slice(0,-3)+'.ts';
      else if(resolved.endsWith('.mjs')) resolved=resolved.slice(0,-4)+'.mts';
      queue.push(resolved);
    }
  }
  return seen;
}

test('readiness deployment skips unrelated repository changes without missing transitive code dependencies',()=>{
  const config=JSON.parse(read('deploy/readiness/vercel.json'));
  const script=read('scripts/vercel-ignore-readiness.sh');
  assert.equal(config.ignoreCommand,'bash ../../scripts/vercel-ignore-readiness.sh');
  assert.match(script,/VERCEL_GIT_PREVIOUS_SHA/);
  assert.match(script,/deploy\/readiness\//);
  assert.match(script,/public\/\(revamp/);
  assert.doesNotMatch(script,/\|src\/\|/);
  assert.doesNotMatch(script,/tests\//);
  assert.doesNotMatch(script,/docs\//);

  const closure=readinessRelativeDependencyClosure('deploy/readiness/src/index.ts');
  for(const dependency of closure){
    if(!dependency.startsWith('src/')) continue;
    const escaped=dependency.replaceAll('.', '\\.');
    assert.ok(
      script.includes(escaped),
      `readiness Vercel ignore guard must rebuild when ${dependency} changes`
    );
  }
});

test('Preview release gate shares the main Vercel deployment boundary',()=>{
  const workflow=read('.github/workflows/preview-release-gate.yml');
  assert.match(workflow,/fetch-depth:\s*0/);
  assert.match(workflow,/git rev-list --reverse --first-parent/);
  assert.match(workflow,/VERCEL_GIT_PREVIOUS_SHA="\$parent" VERCEL_GIT_COMMIT_SHA="\$commit" bash scripts\/vercel-ignore-main\.sh/);
  assert.match(workflow,/no commit in this PR changes main deployment inputs/);
  assert.match(workflow,/steps\.applicability\.outputs\.release_sha/);
  assert.match(workflow,/steps\.applicability\.outputs\.required == 'true'/);
});
