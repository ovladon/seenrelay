# Infrastructure Freeze — Adoption First

SeenRelay has enough infrastructure for the current observed traffic. Until an explicit measured bottleneck or external customer requirement exists, new infrastructure classes are frozen.

## Frozen by default

Do not add Kubernetes, Helm, Terraform, a message broker, distributed locks, active-active multi-region, service mesh, gRPC, a new database technology, a new queue/pub-sub substrate, or another deployment control plane merely for architectural completeness.

## Changes that remain allowed

- security fixes;
- correctness fixes;
- production incident remediation;
- measured latency/cost bottlenecks;
- dependency maintenance;
- release reliability;
- SLO/SLI and disaster-recovery evidence;
- machine-first discovery and distribution;
- integrations that reduce adoption friction;
- changes directly justified by verified external usage.

## Admission rule for new infrastructure

A proposal must identify at least one of:

1. a measured production constraint;
2. a verified external user/customer requirement;
3. a security or compliance obligation;
4. a lower-cost simplification that removes existing infrastructure.

Absent one of those, the default decision is **do not build it**.

The current priority is adoption evidence, not architectural breadth.
