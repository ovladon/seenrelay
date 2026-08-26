# Fleet integration checklist

- [ ] Pick a repeated paid or slow source-backed validation.
- [ ] Define one stable SeenRelay fact identity.
- [ ] Bind the existing validator once with `protectValidation` or `protect_validation`.
- [ ] Start with no reuse policy so every original validation still runs.
- [ ] Run Shadow Proof on representative fleet traffic.
- [ ] Compare measured reusable rate with monetary and latency break-even thresholds.
- [ ] Enable bounded reuse only for fact classes and freshness windows approved by caller policy.
- [ ] Keep `UNKNOWN`, `STALE`, `CONTESTED`, relay failure and policy rejection fail-open into the original validation.
- [ ] OBSERVE only independently obtained source results.
- [ ] Track actual downstream calls and provider spend avoided; do not count package downloads, MCP discovery, or first-party Reference Observer activity as adoption.
