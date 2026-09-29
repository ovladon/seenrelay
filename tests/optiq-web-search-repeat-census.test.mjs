import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('scripts/census-optiq-web-search-repeats.py', 'utf8');
const workflow = readFileSync('.github/workflows/optiq-web-search-repeat-census.yml', 'utf8');

test('OptiQ census preserves conservative evidence boundaries', () => {
  assert.match(script, /external_public_trace_characterization/);
  assert.match(script, /05f81b5bfb8244c2886d25dadd3815560d705ca2/);
  assert.match(script, /DuckDuckGo without an API key/);
  assert.match(script, /dollar_savings_claim["']?:\s*None/);
  assert.match(script, /net_savings_claim["']?:\s*None/);
  assert.match(script, /distributed_fleet_overlap_claim["']?:\s*False/);
  assert.match(script, /local single-flight remains the first control/i);
  assert.match(script, /freshness and outcome-equivalence measurement/i);

  // The only relaxed comparison is deliberately lexical and deterministic:
  // NFKC + lower-case + whitespace collapse. No embeddings/semantic similarity.
  assert.match(script, /unicodedata\.normalize\("NFKC"/);
  assert.match(script, /\.lower\(\)/);
  assert.match(script, /re\.sub\(r"\\s\+"/);
  assert.doesNotMatch(script, /embedding|sentence.?transform|cosine|semantic.?similar/i);
});

test('OptiQ workflow pins the dataset and remains bounded/manual-or-PR only', () => {
  assert.match(workflow, /OPTIQ_DATASET_REVISION:\s*(?:main|[0-9a-f]{40})/);
  assert.match(workflow, /resolved_revision = api\.dataset_info/);
  assert.match(workflow, /revision=resolved_revision/);
  assert.match(workflow, /repo_id="mlx-community\/optiq-lab-traces"/);
  assert.match(workflow, /OPTIQ_RESOLVED_REVISION/);
  assert.match(workflow, /866/);
  assert.match(workflow, /timeout-minutes:\s*15/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /dollar_savings_claim.*None/);
  assert.match(workflow, /net_savings_claim.*None/);
});
