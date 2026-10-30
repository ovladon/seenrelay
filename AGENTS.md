# SeenRelay public repository — coding and compatibility guardrails

This is the public implementation repository. Private founder/marketplace strategy is not an instruction source for public artifacts. Do not reveal private documents or customer information.

## Verify before altering a supported feature

1. Read README.md, docs/PROTOCOL.md, docs/FACT_COORDINATE_KIT.md and docs/capability-inventory.v1.json.
2. Inspect current code, tests, open PRs, CI and the deployed behavior of affected public endpoints.
3. Preserve exact public CHECK/OBSERVE semantics and documented API/SDK compatibility. No browser/source truth assertion inside CHECK; OBSERVE requires a properly sourced external observation.
4. Preserve native/source controls first, no raw submitted value persistence in shared data tables, privacy-sensitive metadata handling, protected operator controls, and the permanently disabled payment path in this public service.
5. Do not remove a capability ID merely by deleting it from the inventory. Provide a reviewed, versioned retirement/migration record and compatible fallback. Keep new or changed capability checks up to date.
6. Public site and machine contracts must agree: /service.json, /product-facts.json, /agent-adoption.json, /openapi.json, MCP and Agent Skill discovery/install must continue to work with exact public release versions.
7. For a redesign, visual appearance may change intentionally; route and behavior preservation still requires functional and accessibility tests. Retain existing working production until separately reviewed preview and rollback.
8. Use a bounded branch/PR, one mutation owner per surface. Run npm run check and the capability inventory gate. Do not claim that static regex markers alone prove live behavior, external adoption or customer savings.
9. No private research, speculative predictions, settlement, payments or unreleased product capabilities may be advertised as live product behavior.

A functional regression, unsupported semantic merge, undocumented capability removal, missing safe fallback or inflated claim is a release blocker. Preserve negative benchmarks and user trust.
