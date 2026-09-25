import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = 'https://seenrelay.com';
const OUT = path.resolve('artifacts/product-hunt');
const chrome = process.env.CHROME_PATH;
if (!chrome) throw new Error('CHROME_PATH is required');

await fs.mkdir(OUT, { recursive: true });

const catalogResponse = await fetch(`${BASE}/starter-facts.json`, { headers: { accept: 'application/json' } });
if (!catalogResponse.ok) throw new Error(`starter catalog HTTP ${catalogResponse.status}`);
const catalog = await catalogResponse.json();
const starter = catalog.facts.find((x) => x.id === 'github-status-indicator');
if (!starter) throw new Error('github-status-indicator starter fact missing');

const sourceResponse = await fetch(starter.fact.source, { headers: { accept: 'application/json' } });
if (!sourceResponse.ok) throw new Error(`authoritative source HTTP ${sourceResponse.status}`);
const sourceJson = await sourceResponse.json();
const segments = starter.fact.locator.value.split('/').slice(1).map((x) => x.replaceAll('~1','/').replaceAll('~0','~'));
let known = sourceJson;
for (const segment of segments) known = known?.[segment];
if (typeof known !== 'string' && typeof known !== 'number' && typeof known !== 'boolean') {
  throw new Error('authoritative locator did not resolve to a scalar');
}
known = String(known);

const browser = await puppeteer.launch({
  headless: true,
  executablePath: chrome,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 1270, height: 760, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 90000 });

await page.screenshot({ path: path.join(OUT, '01-seenrelay-hero.png'), type: 'png' });

await page.waitForSelector('#live-check-form', { timeout: 30000 });
await page.evaluate(() => {
  document.querySelector('#live-check')?.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -8);
});
await new Promise(r => setTimeout(r, 500));

await page.select('#live-check-fact', 'github-status-indicator');
await page.$eval('#live-check-known', (el, value) => { el.value=''; el.dispatchEvent(new Event('input',{bubbles:true})); el.value=String(value); el.dispatchEvent(new Event('input',{bubbles:true})); }, known);
await page.$eval('#live-check-max-age', (el) => { el.value='3600'; el.dispatchEvent(new Event('input',{bubbles:true})); });
await page.click('.rv-live-check-submit');

await page.waitForFunction(() => {
  const el = document.querySelector('.rv-live-check-status');
  return el && el.textContent && el.textContent.trim() !== 'READY';
}, { timeout: 30000 });

const checkStatus = await page.$eval('.rv-live-check-status', el => el.textContent?.trim() || '');
const resultText = await page.$eval('#live-check-result', el => el.innerText);
await page.screenshot({ path: path.join(OUT, '02-seenrelay-live-check-real-result.png'), type: 'png' });

await page.evaluate(() => {
  document.querySelector('#start')?.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -8);
});
await new Promise(r => setTimeout(r, 500));
await page.screenshot({ path: path.join(OUT, '03-seenrelay-scanner-shadow-audit.png'), type: 'png' });

await fs.writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({
  captured_at: new Date().toISOString(),
  production_url: BASE,
  viewport: { width: 1270, height: 760 },
  fact_id: starter.id,
  authoritative_source: starter.fact.source,
  authoritative_locator: starter.fact.locator,
  authoritative_value_used: known,
  caller_max_age_seconds: 3600,
  production_check_status: checkStatus,
  production_result_text: resultText
}, null, 2) + '\n');

await browser.close();
console.log(JSON.stringify({ known, checkStatus, resultText }));
