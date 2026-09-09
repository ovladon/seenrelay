import test from 'node:test';
import assert from 'node:assert/strict';
import { sitemapXml } from '../src/adoption.js';

const expected = [
  ['https://seenrelay.com/', '2026-09-09'],
  ['https://seenrelay.com/fleet', '2026-09-08'],
  ['https://seenrelay.com/readiness', '2026-09-09'],
  ['https://seenrelay.com/economics', '2026-09-01'],
  ['https://seenrelay.com/quickstart', '2026-09-08'],
  ['https://seenrelay.com/clients', '2026-09-08'],
  ['https://seenrelay.com/trust', '2026-09-08'],
  ['https://seenrelay.com/data-practices', '2026-08-30'],
] as const;

test('sitemap exposes verified significant lastmod dates for every public human URL', () => {
  const xml = sitemapXml('https://seenrelay.com');
  const entries = [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g)]
    .map((match) => [match[1], match[2]] as const);

  assert.deepEqual(entries, expected);
  assert.equal((xml.match(/<url>/g) ?? []).length, expected.length);
  assert.equal((xml.match(/<lastmod>/g) ?? []).length, expected.length);
  assert.doesNotMatch(xml, /<changefreq>|<priority>/);
});
