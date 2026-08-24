# Deployment — Vercel + Neon

Do not run migrations before Vercel and Neon are linked.

## 1. Vercel
Create/import the Git repository as a Vercel project. A `*.vercel.app` domain is sufficient for initial private testing; a custom domain can be attached later without changing application semantics.

## 2. Neon
Install Neon Postgres from the Vercel Marketplace into the same project. Confirm Vercel injects `DATABASE_URL` into development, preview and production.

## 3. Secrets
Set a high-entropy `PRIVACY_SALT` (minimum 32 characters). Production/preview fail closed if it is missing. Do not rotate it casually because it intentionally breaks continuity of privacy-preserving client/observer hashes. Keep:

```text
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=none
```

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
Load `.env.local` into the shell, then:

```bash
npm run db:migrate
```

## 7. Deploy

```bash
vercel --prod
```

## 8. Production verification
Verify `/`, `/healthz`, `/openapi.json`, `/mcp`, `/v1/check`, `/v1/observe` and confirm billing endpoints cannot collect money.

## 9. Cost protection
Before broad registry publication configure Vercel spend management and firewall/rate controls. Keep a low hard monthly ceiling during free validation.
