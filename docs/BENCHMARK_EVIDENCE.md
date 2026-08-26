# Benchmark evidence contract

The public workload matrix is generated from verification-gated benchmark records in `public/product-facts.json`.

## Publication boundary

A benchmark may propose a public record only after its benchmark-specific kill criteria have been evaluated. The proposal must contain `publication_candidate: true`, every declared kill criterion must be `true`, and the benchmark record must include a normalized `matrix` object, an evidence URL, an artifact SHA-256 digest, and an explicit caveat.

Passing this contract does not make a benchmark a universal performance claim. It makes the measurement eligible for the normal SeenRelay release process.

## Normalized matrix fields

Each record supplies a stable `series_key`, surface, configuration, evidence level, fit classification, cost and latency outcomes, baseline and reuse medians, provider work avoided, freshness window, evidence URL, artifact digest, and caveat. The website shows the latest verified record for each `series_key`; the canonical facts file can retain historical runs.

## Automation

`scripts/benchmark-evidence.mjs` validates current canonical records or ingests one normalized benchmark evidence file. `scripts/propose-benchmark-evidence.sh` can be called by a benchmark workflow after the benchmark itself succeeds. It runs the evidence gate and the full project checks, then opens a data-only pull request. It does not merge or deploy public claims directly.
