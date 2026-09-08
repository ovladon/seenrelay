import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/index.js';

async function postV2(site = 'example.com') {
  return app.request('https://seenrelay.test/readiness/audit/v2', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ site })
  });
}

test('readiness v2 route is 503 when activation is not requested', async () => {
  const previousEnabled = process.env.READINESS_V2_ENABLED;
  const previousCovered = process.env.READINESS_V2_COST_COVERED;
  delete process.env.READINESS_V2_ENABLED;
  delete process.env.READINESS_V2_COST_COVERED;
  try {
    const response = await postV2();
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error.code, 'READINESS_V2_DISABLED');
  } finally {
    if (previousEnabled === undefined) delete process.env.READINESS_V2_ENABLED; else process.env.READINESS_V2_ENABLED = previousEnabled;
    if (previousCovered === undefined) delete process.env.READINESS_V2_COST_COVERED; else process.env.READINESS_V2_COST_COVERED = previousCovered;
  }
});

test('readiness v2 route is 503 when activation is requested without cost coverage', async () => {
  const previousEnabled = process.env.READINESS_V2_ENABLED;
  const previousCovered = process.env.READINESS_V2_COST_COVERED;
  process.env.READINESS_V2_ENABLED = 'true';
  delete process.env.READINESS_V2_COST_COVERED;
  try {
    const response = await postV2();
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error.code, 'READINESS_V2_COST_COVERAGE_REQUIRED');
  } finally {
    if (previousEnabled === undefined) delete process.env.READINESS_V2_ENABLED; else process.env.READINESS_V2_ENABLED = previousEnabled;
    if (previousCovered === undefined) delete process.env.READINESS_V2_COST_COVERED; else process.env.READINESS_V2_COST_COVERED = previousCovered;
  }
});
