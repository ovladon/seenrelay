# Runtime database role

SeenRelay separates database schema authority from application runtime authority.

- `DATABASE_ADMIN_URL` is the migration-only credential used by `npm run db:migrate`.
- `DATABASE_URL` is the application credential used by the deployed service.
- Runtime code must never read `DATABASE_ADMIN_URL`.
- The migration creates the `seenrelay_runtime` NOLOGIN grant role. A dedicated LOGIN role is created out-of-band, granted membership in `seenrelay_runtime`, and used only for `DATABASE_URL`.
- The runtime role has schema `USAGE` but no schema `CREATE`, no superuser/database/role creation authority, and only the table-level DML required by the service.

The login password is an operational secret and must not be committed. After changing the deployed `DATABASE_URL`, verify both normal CHECK/OBSERVE/Admin behavior and that the deployed login does not have schema-creation authority.
