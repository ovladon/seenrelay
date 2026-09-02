import test from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateStandardsShadowResult,
  standardsShadowSamplingProvenance
} from '../scripts/standards-shadow-collector-v2.mjs';

function rawResult() {
  return {
    input: { schema_version: 2, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', sample_type: 'natural_workload', records: [] },
    summary: { schema_version: 2, workload_id: 'standards-watch-daily-v1', preliminary_sample_floor_met: false },
    evaluation: null,
    state: { schema_version: 1, workload_id: 'standards-watch-daily-v1', entries: {} },
    ledger: { schema_version: 1, workload_id: 'standards-watch-daily-v1', workload_class: 'structured_source_reads', natural_schedule: 'daily', records: [] }
  };
}

function assertProvenance(document, { sampleType, runEvent, runId, parentRunId }) {
  assert.equal(document.provenance_schema_version, 2);
  assert.equal(document.collection_epoch, 'schedule-only-v3');
  assert.equal(document.sample_type, sampleType);
  assert.equal(document.run_event, runEvent);
  assert.equal(document.run_id, runId);
  assert.equal(document.parent_run_id, parentRunId);
}

test('standards benchmark input is self-describing for natural evidence', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'schedule', runId: '1002', parentRunId: '1001' });
  const result = annotateStandardsShadowResult(rawResult(), provenance);
  assertProvenance(result.input, {
    sampleType: 'natural_workload', runEvent: 'schedule', runId: '1002', parentRunId: '1001'
  });
});

test('standards benchmark input is self-describing for commissioning evidence', () => {
  const provenance = standardsShadowSamplingProvenance({ runEvent: 'push', runId: '2001' });
  const result = annotateStandardsShadowResult(rawResult(), provenance);
  assertProvenance(result.input, {
    sampleType: 'commissioning', runEvent: 'push', runId: '2001', parentRunId: null
  });
});
