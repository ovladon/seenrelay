# Verified results

Generated from public/product-facts.json. Do not edit measured claims here by hand.

| Surface / configuration | Evidence | Fit | Cost | Latency | Provider work avoided | Baseline median | SeenRelay reuse median | Caller freshness window |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Basic cached scrape · Fixed URL · provider cache enabled | first-party smoke, n=5 | conditional | better | worse | 5/5 calls; 5 credits | 91.03 ms | 648.98 ms | 3600s |
| Structured JSON extraction · Fixed URL · JSON structured extraction | first-party smoke, n=3 | good | better | better | 3/3 calls; 15 credits | 1265.68 ms | 617.78 ms | 300s |
| Browser interaction · Fixed URL · scrape + interact(code) + stop | first-party smoke, n=3 | good | better | better | 3/3 calls; 9 credits | 4385.018 ms | 661.372 ms | 3600s |

## Interpretation

Rows are verification-gated measurements, not universal performance promises. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy. The website shows the latest verified result per configuration while this document retains the published benchmark records.

Evidence:
- firecrawl-basic-scrape-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32953753129 (sha256:1177ca13a1974064942487671352f42a45a74c36745a24680ba62e5d39b3b5f4)
  - First-party smoke benchmark with a small sample. It demonstrates mechanics and measured provider-call avoidance, not a universal reuse rate or universal latency advantage.
- firecrawl-json-extraction-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32953960787 (sha256:4fe2ad7e74305996d2fae8210bbefce3ba8a2096c0145b250e9006e078aa7a41)
  - First-party smoke benchmark, n=3, with caller policy accepting observations up to 300 seconds old. Reuse is not equivalent to a policy requiring a brand-new source fetch on every call.
- firecrawl-browser-interaction-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32965390611 (sha256:51ebee97e40dee759a49d3171e03fc7c5f7cf344411fbd7dede6c941640d3df3)
  - First-party smoke benchmark, n=3, on one intentionally repeated source-backed fact. It demonstrates the mechanics and measured savings when eligible reuse exists; it does not establish a natural-world reuse rate or a universal browser-workload speedup.
