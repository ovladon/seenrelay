import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const codeql = fs.readFileSync('.github/workflows/codeql.yml', 'utf8');
const dependencyReview = fs.readFileSync('.github/workflows/dependency-review.yml', 'utf8');
const http = fs.readFileSync('src/http.ts', 'utf8');
const mcp = fs.readFileSync('src/mcp.ts', 'utf8');
const admin = fs.readFileSync('src/admin.ts', 'utf8');

test('security workflows are immutable-SHA pinned and least-privilege scoped', () => {
  assert.match(codeql, /github\/codeql-action\/init@[0-9a-f]{40}/);
  assert.match(codeql, /github\/codeql-action\/analyze@[0-9a-f]{40}/);
  assert.match(codeql, /queries: security-extended/);
  assert.match(codeql, /security-events: write/);
  assert.doesNotMatch(codeql, /contents: write/);
  assert.match(dependencyReview, /actions\/dependency-review-action@[0-9a-f]{40}/);
  assert.match(dependencyReview, /fail-on-severity: high/);
  assert.doesNotMatch(dependencyReview, /contents: write|pull-requests: write|id-token: write/);
});

test('transport/admin body limits are explicit rather than delegated to platform defaults', () => {
  assert.match(http, /class PayloadTooLargeError/);
  assert.match(http, /reader\.read\(\)/);
  assert.match(mcp, /boundedRequest\(request, config\(\)\.maxBodyBytes\)/);
  assert.match(mcp, /status: 413/);
  assert.match(admin, /readJsonBody<\{secret\?:unknown\}>\(request, config\(\)\.maxBodyBytes\)/);
  assert.doesNotMatch(admin, /await request\.json\(\)/);
});
