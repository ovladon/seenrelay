# Disaster Recovery

SeenRelay keeps disaster recovery proportional to the current architecture: GitHub source history, reproducible migrations, Vercel deployment configuration, Neon PostgreSQL, DNS/domain custody and external secret custody.

## Recovery objective

The current objective is **reproducible service restoration**, not active-active multi-region failover.

The minimum recovery path is:

1. recover the Git repository and pinned dependency lock;
2. provision a fresh PostgreSQL database;
3. apply all committed migrations in order;
4. restore the latest provider/database backup when available;
5. configure a least-privilege runtime login;
6. restore Vercel environment variables from the secure inventory;
7. deploy the current verified main commit;
8. verify /healthz, service.json, OpenAPI, MCP, CHECK and OBSERVE;
9. verify runtime controls before normal traffic.

## Automated restore drill

`Disaster Recovery Restore Drill` runs weekly and whenever migrations change.

It creates an isolated PostgreSQL service, applies every migration, writes one synthetic fact, performs a `pg_dump`, restores that dump into a fresh database, and verifies:

- the public table set matches;
- the synthetic fact survives;
- the global runtime control row survives;
- Adoption Atlas tables exist after restore.

No Production or Preview database is read or modified by this drill.

The drill is intentionally narrower than a Neon provider-backup exercise. Provider-level backup retention and regional failover remain provider responsibilities and should be tested separately if adoption or contractual requirements justify them.

## Alerting

A failed scheduled drill opens or refreshes a GitHub issue named `[dr] SeenRelay restore drill failure`. A subsequent successful drill closes it automatically.
