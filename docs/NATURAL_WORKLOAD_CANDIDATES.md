# Natural workload candidate status

This document records pre-screening decisions for the natural-workload admission gate. It prevents a rejected mechanics test or stronger-cache case from later being relabeled as natural evidence without new facts.

The admission contract remains `docs/NATURAL_WORKLOAD_GATE.md`. A candidate listed here can be reconsidered when its workload or available controls materially change.

## Admitted for natural collection

### Structured source reads

**Workload:** `standards-watch-daily-v1`  
**Class:** `structured_source_reads`  
**Status:** admitted, collecting naturally

The existing Standards Shadow workflow performs operational structured reads against real standards/version sources. Repetition comes from the daily watch rather than a loop added for the benchmark. Available source-native validators are retained and measured before any conclusion about Shared CHECK.

The collector is first-party research evidence, not external adoption evidence. Its preliminary 100-protected-call floor is not a statistical-confidence claim.

### Fleet tool validations

**Workload:** `wrapper-deterministic-suite-fleet-v1`  
**Class:** `fleet_tool_validations`  
**Status:** admitted, collecting naturally

CI and Client Wrappers already re-check the same deterministic JavaScript wrapper suite on independent GitHub Actions workers. The collector does not add a duplicate execution: CI partitions the existing structural suite and Client Wrappers replaces its previous direct invocation one-for-one.

A successful counterpart GitHub workflow on the same head/base is measured first as the stronger provider-native control. Provider-native hits bypass Shared CHECK and are excluded from the protected-call ledger. Authoritative tests still run during research collection, including hypothetical reuse cases.

## Not admitted

### Historical fixed example.com browser benchmarks

**Class considered:** `browser_extraction_reads`  
**Status:** rejected as natural evidence

The historical Firecrawl example.com workloads are fixed-fact mechanics tests. Their fact distribution was constructed for the benchmark and therefore cannot establish a natural reuse rate. Preserve their measured mechanics evidence, but do not reclassify it.

### Pricing freshness checks

**Class considered:** `browser_extraction_reads`  
**Status:** rejected before collection

The pricing facts currently used by SeenRelay have direct authoritative web/API paths. Browser extraction would not be the best existing non-shared path for those facts. A browser-backed comparison would therefore be an intentionally weaker baseline.

Reconsider only if an operational pricing fact genuinely requires rendered/browser state and no equivalent authoritative direct path exists.

### Third-party discovery-directory checks

**Class considered:** `browser_extraction_reads`  
**Status:** rejected before collection

Current discovery directories considered for SeenRelay expose API, registry, or direct fetch paths adequate for the metadata SeenRelay needs. Browser extraction is not justified merely because the same information is also visible on a rendered page.

Reconsider only for a distinct operational fact that cannot be obtained equivalently through the directory's authoritative machine-readable or direct-fetch surface.

### Public package registry installation verification

**Class considered:** `fleet_tool_validations`  
**Status:** rejected as a reusable positive candidate

Release verification intentionally proves that the exact public package can be installed from the live registry in a clean environment. That policy requires live verification for the release being promoted. A prior worker's result cannot replace the required live registry check.

These runs may remain useful as negative/control evidence, but must not be counted as avoidable validation merely because another workflow installed the same version.

### Exact-build visual preview audit

**Class considered:** `browser_extraction_reads`  
**Status:** rejected before natural collection

The temporary adoption-site visual audit used Chromium/Playwright to validate rendered layout, horizontal overflow, interactions, page/console errors and exact preview behavior. Browser execution was a legitimate validation path for those facts.

However, the audit explicitly required the preview deployment SHA to equal the workflow's exact `RELEASE_SHA`. Historical natural runs corresponded to changed builds, and the final successful audit was a single run for its exact build before the temporary workflow was removed. A result for one build is not authoritative for a changed build under that policy.

Re-running an unchanged build solely to manufacture repetition would violate the natural-workload gate.

## Browser-class reopening rule

`browser_extraction_reads` remains **unadmitted** until a real operational workload satisfies all of the following:

1. browser/rendered extraction is the best qualifying authoritative non-shared path for the fact being validated;
2. the workload would run even if SeenRelay did not exist;
3. repeated equivalent fact coordinates arise naturally from captured or faithfully replayed work rather than benchmark construction;
4. every available provider-native cache/cache-only path is measured first;
5. authoritative browser/extraction validation remains enabled during evidence collection;
6. every hypothetical policy-accepted reuse is compared with that authoritative result;
7. raw fact identities, sources, values and per-call timestamps are excluded from exported benchmark records.

Until such a workload exists, the three-class admission set is incomplete. Do not substitute a second structured-source or fleet workload for the missing browser class, do not lower the preliminary sample floor, and do not broaden Shared CHECK claims/defaults from the two admitted classes alone.
