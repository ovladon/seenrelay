# Production SLO / SLI

SeenRelay uses a small synthetic operational objective appropriate to its current adoption stage. It is an engineering guardrail, not a contractual SLA.

## Service level indicators

The scheduled `Production SLO Watch` measures from GitHub Actions:

- `/healthz` successful production responses;
- `/service.json` successful machine-descriptor responses;
- first-party controlled `CHECK` requests against a benchmark-marked fact;
- CHECK p50, p95 and p99 latency.

The CHECK fact uses the reserved `seenrelay_internal_benchmark` marker so these requests are excluded from external-adoption evidence.

## Current objectives

Per synthetic probe:

- health success fraction: 100%;
- service descriptor success fraction: 100%;
- CHECK success fraction: 100%;
- CHECK p99: <= 2000 ms.

The workflow runs four times per day. Breaches open or refresh `[slo] SeenRelay production SLI breach`; recovery closes the issue automatically.

These thresholds are deliberately conservative and may be revised only from measured production evidence. They do not imply end-user geographic coverage, a formal uptime guarantee or customer SLA.

## Error budget

At the current stage, the practical error budget is **zero tolerated failures inside one synthetic probe**. This is stricter than a mature monthly percentage budget but easier to reason about with low traffic.

When real external traffic is large enough to support stable rolling statistics, replace this probe-level budget with a rolling availability and tail-latency SLO.
