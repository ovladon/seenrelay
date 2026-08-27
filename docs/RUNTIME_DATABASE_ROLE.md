# Runtime database role

SeenRelay separates database schema authority from application runtime authority.

- `DATABASE_ADMIN_URL` is the migration-only credential used by `npm run db:migrate`.
- `DATABASE_URL` is the application credential used by the deployed service.
- Runtime code must never read `DATABASE_ADMIN_URL`.
- The migration creates the `seenrelay_runtime` NOLOGIN grant role. A dedicated LOGIN role is created out-of-band, granted membership in `seenrelay_runtime`, and used only for `DATABASE_URL`.
- The runtime role has schema `USAGE` but no schema `CREATE`, no superuser/database/role creation authority, and only the table-level DML required by the service.
- `seenrelay_runtime` is a privilege container only and must not own application objects.

## Safe login cutover

Run migrations with the owner/admin connection outside the deployed runtime. Then create a dedicated SQL login with no administrative attributes and grant it inherited runtime privileges without allowing `SET ROLE` into the grant role:

```sql
CREATE ROLE seenrelay_app
  LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS INHERIT
  PASSWORD '<strong-random-password>';

GRANT seenrelay_runtime TO seenrelay_app
  WITH ADMIN FALSE, INHERIT TRUE, SET FALSE;
```

The password is an operational secret: generate it outside source control and do not put the real value in commits, issues, logs, or documentation. The login must not own application tables, schemas, functions, or migrations.

After creating the login:

1. Set only the limited login connection as deployed `DATABASE_URL`; never deploy `DATABASE_ADMIN_URL`.
2. Verify normal CHECK, OBSERVE, public metrics, and Admin read/control behavior against an isolated Preview before Production cutover.
3. Verify the deployed login has schema `USAGE` but not schema `CREATE`, cannot create databases or roles, and has only the documented table DML.
4. Keep the previous Production database credential available only for immediate rollback until the limited-login deployment is proven healthy; then retire it from the runtime environment.

PostgreSQL 18 role membership is intentional here: `INHERIT TRUE` makes the grant-role privileges available to the login, while `SET FALSE` prevents the login from switching session identity to `seenrelay_runtime`. Because inherited-without-SET roles should not own SQL objects, the grant role remains ownership-free.
