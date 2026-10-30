import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
const rootStart = source.indexOf("app.get('/', (c) => {");
const nextRoute = source.indexOf("app.post('/v1/adoption-report'");

function rootRoute() {
  assert.ok(rootStart >= 0 && nextRoute > rootStart, 'Expected canonical root service route');
  return source.slice(rootStart, nextRoute);
}

test('isolated design prototype never replaces the live homepage or root machine descriptor', () => {
  const root = rootRoute();
  assert.match(root, /if \(accept\.includes\('text\/html'\)\)/);
  assert.match(root, /return c\.html\(publicLandingPage\(origin\)\)/);
  assert.match(root, /return c\.json\(serviceDescriptor\(origin\)\)/);
  assert.doesNotMatch(root, /vnext-preview/);
});

test('the direct vNext preview and local assets are present in Vercel public directory', () => {
  const base = new URL('../public/vnext-preview/', import.meta.url);
  for (const path of ['index.html', 'theme.css', 'demo.js', 'agents.html', 'guide.css']) {
    const asset = fs.readFileSync(new URL(path, base), 'utf8');
    assert.ok(asset.length > 100, path + ' should not be empty');
  }
  const homepage = fs.readFileSync(new URL('index.html', base), 'utf8');
  assert.match(homepage, /Isolated design preview/);
  assert.match(homepage, /SIMULATED FIELD MAP/);
  assert.match(homepage, /npx seenrelay scan/);
  assert.match(homepage, /\/service\.json/);
});
