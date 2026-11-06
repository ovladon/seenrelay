# Experimental agent evidence Delta census

Local, observation-only research tool. It does not execute external operations or activate result reuse.

Run from a SeenRelay source checkout:

```bash
node clients/typescript/scripts/agent-evidence-census-cli.mjs ./trace.json --json
```

Input schema: `seenrelay-agent-evidence-census-v0`, with arrays `capsules` and `requests`.

Each capsule provides `capsule_id`, `scope_hash`, `operation_hash`, `environment_hash`, `output_hash`, `authoritative_validated`, `dependencies_complete`, `artifact_available`, and nonempty `dependencies`.

Each request provides `request_id`, `capsule_id`, `requested_at_ms`, matching opaque hashes, `dependencies`, `observed_authoritative_execution`, `observed_output_hash`, `native_status`, and explicit read-only/reuse policy. The output hash must match the observed authoritative output.

Dependencies contain SHA-256 opaque identity and fingerprint, and a type: `git_blob`, `tool_config`, or `mutable_external`. Mutable external evidence additionally requires source-confirmed state and an unexpired validity time. Include every result-affecting dependency; the tool cannot prove manifest completeness.

The native control comparator is mandatory for a candidate: `measured_hit`, `measured_miss`, or `not_measured`. Native hits win. Model reviews requiring independent judgments are excluded. Incomplete evidence, changed dependencies, unsafe scopes, and mismatched results never qualify.

Optional marginal cost must have verifiable provenance. The report shows **potential, not actual avoided calls**. Realized avoided executions and verified net savings remain unknown.

Use this only on consented, sanitized local inputs. No external requests are made. The tool prints only aggregate counts and cannot certify identity, correctness, economic savings, or customer adoption. A zero-benefit result relative to the strongest native solution is a valid negative result.
