# Verified results

Generated from `public/product-facts.json`. Do not edit measured claims here by hand.

| Workload | Evidence | Provider work avoided | Baseline median | SeenRelay reuse median | Caller freshness window |
| --- | --- | ---: | ---: | ---: | ---: |
| Firecrawl basic scrape | first-party smoke, n=5 | 5/5 provider calls avoided; 5 credits avoided | 91.03 ms | 648.98 ms | 3600s |
| Firecrawl JSON structured extraction | first-party smoke, n=3 | 3/3 provider calls avoided; 15 credits avoided | 1265.68 ms fresh; 1039.5 ms provider-cached | 617.78 ms | 300s |
| Firecrawl browser interaction | first-party smoke, n=3 | 3/3 provider calls avoided; 9 credits avoided | 4385.018 ms | 661.372 ms | 3600s |

## Interpretation

The basic scrape benchmark demonstrated lower provider-credit consumption but worse latency than a Firecrawl cache hit. The JSON structured-extraction and browser-interaction benchmarks demonstrated both lower provider-credit consumption and lower median latency in these small first-party runs. None of these benchmarks establishes a universal reuse rate. A caller must measure its own workload in shadow mode and set its own freshness/reuse policy.

Evidence:
- firecrawl-basic-scrape-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32953753129 (sha256:1177ca13a1974064942487671352f42a45a74c36745a24680ba62e5d39b3b5f4)
- firecrawl-json-extraction-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32953960787 (sha256:4fe2ad7e74305996d2fae8210bbefce3ba8a2096c0145b250e9006e078aa7a41)
- firecrawl-browser-interaction-2026-08-26: https://github.com/ovladon/seenrelay/actions/runs/32965390611 (sha256:51ebee97e40dee759a49d3171e03fc7c5f7cf344411fbd7dede6c941640d3df3)
