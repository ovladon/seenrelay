import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdoptionReport, shareAdoptionReport } from '../clients/typescript/scripts/adoption-report-lib.mjs';

test('adoption report contains only closed coarse fields', async () => {
  const report = await buildAdoptionReport({
    integration:'ambient',
    deployment:'local',
    mode:'shadow',
    verdict:'USE',
    workload:'mcp-tool'
  });
  assert.deepEqual(Object.keys(report).sort(), [
    'deployment','integration_class','mode','schema','seenrelay_version','verdict','workload_class'
  ]);
  const serialized=JSON.stringify(report);
  for (const forbidden of ['prompt','response','source_url','repo','filename','customer','ip']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('sharing is explicit and posts only the built report', async () => {
  const report = await buildAdoptionReport({
    integration:'fleet', deployment:'private-l1', mode:'active', verdict:'DO_NOT_USE', workload:'compute'
  });
  let seen;
  const result = await shareAdoptionReport(report, {
    endpoint:'https://example.test/v1/adoption-report',
    fetchImpl: async (url, init) => {
      seen={url,init};
      return new Response(JSON.stringify({accepted:true}), {status:202,headers:{'content-type':'application/json'}});
    }
  });
  assert.equal(result.accepted,true);
  assert.equal(seen.url,'https://example.test/v1/adoption-report');
  assert.deepEqual(JSON.parse(seen.init.body),report);
});
