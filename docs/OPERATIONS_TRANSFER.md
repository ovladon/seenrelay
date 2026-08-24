# Operational Custody Transfer

SeenRelay is designed so administrative custody can move between authorized operators without requiring downtime or disclosure of private operator context.

## Transfer order

1. Establish receiving administrative identities for GitHub, Vercel, Neon and the domain registrar.
2. Grant receiving access before revoking existing access.
3. Confirm repository, deployment, database and DNS access independently.
4. Rotate `ADMIN_SECRET` make-before-break by moving the prior current value into `ADMIN_SECRET_PREVIOUS` for a bounded grace period.
5. Rotate `HIVE_SIGNING_SECRET` make-before-break by moving the prior current value into `HIVE_SIGNING_SECRET_PREVIOUS` for a bounded grace period.
6. Keep `PRIVACY_SALT` unchanged unless a versioned migration has been designed and tested.
7. Run CI, Preview Release Gate, Production smoke tests and Control Room checks under receiving custody.
8. Remove the `*_PREVIOUS` variables after operational acceptance.
9. Revoke prior administrative access only after successful acceptance.

## Recovery assets

- GitHub repository and protected `main` history;
- Vercel project, environment configuration and domain mapping;
- Neon project, production database and Preview/CI branch;
- DNS/registrar custody for `seenrelay.com`;
- documented migrations and reproducible `package-lock.json` build;
- current encrypted/secure secret inventory maintained outside source control;
- offline source archive and restoration checkpoint.

## Invariants

- no secrets are stored in source control;
- Preview and Production use separate writable databases;
- credential rotation is make-before-break;
- runtime changes still pass release gates after custody changes;
- private operator plans and personal information do not belong in online project surfaces.
