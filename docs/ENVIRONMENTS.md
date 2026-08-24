# SeenRelay Environment Isolation

## Invariant

Preview and Production must never share a writable database.

- **Production**: Vercel Production -> Neon main branch.
- **Preview / CI**: Vercel Preview -> dedicated Neon branch `seenrelay-preview-ci`.

This is a data-integrity requirement, not an optimization.

## Why

Preview end-to-end tests create facts, observations, Hive leases, useful-reuse events and aggregate metrics. If Preview shares Production state, test activity can be mistaken for external traffic and can contaminate network measurements.

SeenRelay therefore applies three independent barriers:

1. separate database branches for Preview and Production;
2. Preview E2E runs only after environment isolation has been explicitly established;
3. Production rejects SeenRelay's reserved `example.com/seenrelay-*e2e*` namespaces before Hive admission, so a misrouted standard CI request cannot create leases, facts or telemetry.

## Production metric integrity

Public network metrics must represent actual Production activity only. Synthetic test traffic must never be presented as usage, adoption or useful reuse.

Before first public launch:

1. confirm Preview writes only to `seenrelay-preview-ci`;
2. run the full Preview E2E suite;
3. verify Neon main did not change during that run;
4. remove historical test-only state from Neon main;
5. verify Production counters begin at a truthful baseline;
6. deploy Production only after explicit release approval.

## Administrative custody transfer

During any authorized operator/custody change, verify both database targets independently before prior administrative access is removed. The operations export may report aggregate Production state; Preview/CI state is never mixed into Production metrics.
