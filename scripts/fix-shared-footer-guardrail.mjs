import fs from 'node:fs';

const path = 'tests/guardrails.test.mjs';
let text = fs.readFileSync(path, 'utf8');

const setupFrom = "  const publicSource = read('src','public.ts');\n  const stats = read('src','public-db.ts');";
const setupTo = "  const publicSource = read('src','public.ts');\n  const publicFactsView = read('src','public-facts-view.ts');\n  const stats = read('src','public-db.ts');";
if (!text.includes(setupFrom)) throw new Error('guardrail setup marker missing');
text = text.replace(setupFrom, setupTo);

const assertionFrom = "  assert.match(publicSource, /does not decide truth/);\n  assert.match(publicSource, /observations, not universal truth|Recent observations, not universal truth/i);";
const assertionTo = "  assert.match(publicSource, /does not decide truth/);\n  assert.match(publicSource, /siteFooterHtml\\(\\)/);\n  assert.match(publicFactsView, /Recent observations, not universal truth/i);";
if (!text.includes(assertionFrom)) throw new Error('stale footer assertion marker missing');
text = text.replace(assertionFrom, assertionTo);

fs.writeFileSync(path, text);
console.log('Relocated trust-line guardrail to the shared footer renderer.');
