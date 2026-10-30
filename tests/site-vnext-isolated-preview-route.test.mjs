import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const rootStart = source.indexOf("app.get('/', (c) => {");
const nextRoute = source.indexOf("app.post('/v1/adoption-report'");

function rootRoute() {
  assert.ok(rootStart >= 0 && nextRoute > rootStart, 'Expected root service route');
  return source.slice(rootStart, nextRoute);
}

test('site vNext is visible on its own branch preview only', () => {
  const root = rootRoute();
  assert.match(root, /if \(accept\.includes\('text\/html'\)\)/);
  assert.match(root, /process\.env\.VERCEL_ENV === 'preview'/);
  assert.match(root, /process\.env\.VERCEL_GIT_COMMIT_REF === 'a10\/site-vnext-isolated-prototype-20261030'/);
  assert.match(root, /return c\.redirect\('\/vnext-preview\/index\.html', 302\)/);
  assert.ok(root.indexOf('return c.redirect(') < root.indexOf('return c.html(publicLandingPage(origin))'));
});

test('production homepage and machine root descriptor remain unchanged', () => {
  const root = rootRoute();
  assert.match(root, /return c\.html\(publicLandingPage\(origin\)\)/);
  assert.match(root, /return c\.json\(serviceDescriptor\(origin\)\)/);
  assert.ok(root.indexOf('return c.html(publicLandingPage(origin))') < root.indexOf('return c.json(serviceDescriptor(origin))'));
});

test('redirect target and its local design assets are present in public static output', () => {
  for (const path of ['index.html', 'theme.css', 'demo.js', 'agents.html', 'guide.css']) {
    const source = fs.readFileSync(new URL('../public/vnext-preview/' + path, import.meta.url), 'utf8');
    assert.ok(source.length > 100, path + ' should not be empty');
  }
});
