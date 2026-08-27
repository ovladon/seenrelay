# Deployment — Vercel + Neon

Do not run migrations before Vercel and Neon are linked.

## 1. Vercel
Create/import the Git repository as a Vercel project. A `*.vercel.app` domain is sufficient for initial private testing; a custom domain can be attached later without changing application semantics.

## 2. Neon
Install Neon Postgres from the Vercel Marketplace into the same project. Keep the owner/admin connection out of the deployed runtime: use it as `DATABASE_ADMIN_URL` only when running migrations. The deployed `DATABASE_URL` must belong to a dedicated LOGIN role that inherits the migration-created `seenrelay_runtime` grant role.

## 3. Secrets
Do not configure `DATABASE_ADMIN_URL` in the Vercel runtime environment. Set a high-entropy `PRIVACY_SALT` (minimum 32 characters). Production/preview fail closed if it is missing. Do not rotate it casually because it intentionally breaks continuity of privacy-preserving client/observer hashes. Apply the remaining runtime configuration from the committed `.env.example`.

## 4. Pull env locally
Use Vercel CLI only after the project is linked:

```bash
vercel env pull .env.local --yes
```

## 5. Install + test

```bash
npm install
npm run check
```

## 6. Migrate
Supply the admin/owner connection locally as `DATABASE_ADMIN_URL`, then:

```bash
npm run db:migrate
```

The migration script intentionally refuses to use runtime `DATABASE_URL`. After migrations, create/rotate a dedicated LOGIN role out-of-band, grant it membership in `seenrelay_runtime`, and set only that limited credential as deployed `DATABASE_URL`. See [`RUNTIME_DATABASE_ROLE.md`](RUNTIME_DATABASE_ROLE.md).

## 7. Deploy

```bash
vercel --prod
```

## 8. Production verification
Verify `/`, `/healthz`, `/openapi.json`, `/mcp`, `/v1/check` and `/v1/observe`.

## 9. Cost protection
Configure provider spend management and firewall/rate controls before broad traffic. Current public access is free.
