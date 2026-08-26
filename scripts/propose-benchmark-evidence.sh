#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_PATH="${1:-benchmark-evidence.json}"
if [[ ! -f "$EVIDENCE_PATH" ]]; then
  echo "Evidence file not found: $EVIDENCE_PATH" >&2
  exit 2
fi

node scripts/benchmark-evidence.mjs --ingest "$EVIDENCE_PATH" --write
node scripts/sync-public-surfaces.mjs --write
npm run check

if git diff --quiet; then
  echo "Canonical benchmark evidence is already current."
  exit 0
fi

if [[ -z "${GITHUB_RUN_ID:-}" || -z "${GH_TOKEN:-}" ]]; then
  echo "Verified data changes are ready locally; GitHub Actions context is required to open the proposal PR."
  git diff -- public/product-facts.json src/public-facts.generated.ts docs/VERIFIED_RESULTS.md README.md clients/README.md docs/QUICKSTART.md
  exit 0
fi

BENCHMARK_ID="$(node -e "const e=require('./${EVIDENCE_PATH}'); process.stdout.write(e.benchmark.id)")"
BRANCH="benchmark-evidence/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT:-1}"

git switch -c "$BRANCH"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add public/product-facts.json src/public-facts.generated.ts docs/VERIFIED_RESULTS.md README.md clients/README.md docs/QUICKSTART.md
git commit -m "Propose verified benchmark evidence: ${BENCHMARK_ID}"
git push origin "HEAD:${BRANCH}"

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "Publish verified benchmark evidence: ${BENCHMARK_ID}" \
  --body "Automated data-only proposal from a benchmark run that passed its declared kill criteria and the full SeenRelay project checks. Public claims remain subject to the normal release review/merge boundary; this workflow does not auto-merge or deploy."
