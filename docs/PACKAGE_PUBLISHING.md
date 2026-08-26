# SeenRelay client package publishing

This document covers publication of the MIT-licensed JavaScript/TypeScript and Python clients. It does not change the hosted SeenRelay service release or protocol semantics.

## Public package names

- npm: `seenrelay`
- PyPI: `seenrelay`
- initial client version: `0.1.0`
- GitHub release tag format: `clients-vX.Y.Z`
- trusted publishing workflow: `.github/workflows/publish-clients.yml`

The package manifests are required to carry the same version before a client release is published.

## Why npm has one bootstrap step

npm Trusted Publishing can only be configured after the package already exists on npm. Therefore the first npm publication is a one-time package-name bootstrap. Subsequent releases use GitHub OIDC and do not require a long-lived npm publish token.

The first bootstrap should publish the exact validated `seenrelay-0.1.0.tgz` artifact, not rebuild an unrelated working tree.

After `seenrelay@0.1.0` exists on npm, configure its GitHub Actions Trusted Publisher with:

- GitHub user/organization: `ovladon`
- repository: `seenrelay`
- workflow filename: `publish-clients.yml`
- allowed action: `npm publish`
- environment: none unless a protected release environment is deliberately introduced later

The release workflow checks whether the release version already exists on npm. This makes the `clients-v0.1.0` release compatible with the one-time manual npm bootstrap: npm will not attempt to overwrite an existing immutable version.

## PyPI bootstrap

PyPI supports creating a project from a pending Trusted Publisher, so no long-lived upload token is required for the first Python release.

Before publishing `clients-v0.1.0`, configure a pending GitHub Actions publisher on PyPI with:

- PyPI project name: `seenrelay`
- GitHub owner: `ovladon`
- repository: `seenrelay`
- workflow filename: `publish-clients.yml`
- environment: none unless a protected release environment is deliberately introduced later

A pending publisher does not reserve the project name until the first successful publication.

## Release flow after bootstrap configuration

1. Confirm CI, Client Wrappers, Package Validation and Preview Release Gate are green on `main`.
2. Confirm npm and Python package manifests contain the same `X.Y.Z` version.
3. Create a GitHub Release from the intended `main` commit with tag `clients-vX.Y.Z`.
4. `Publish Clients` checks out that exact tag.
5. The npm and Python artifacts are built and installed in clean environments before upload.
6. npm publication uses GitHub OIDC. For the one-time bootstrap version, publication is skipped if that exact immutable version already exists.
7. PyPI publication uses GitHub OIDC through the PyPA publishing action.
8. Verify public installation from clean environments:

```bash
npm install seenrelay
```

```bash
python -m pip install seenrelay
```

9. Verify imports and the bind-once helpers before changing public documentation from "package-ready" to "published".

## Security properties

- No `NPM_TOKEN`, `PYPI_TOKEN`, `TWINE_PASSWORD`, or equivalent long-lived publish secret is stored in the repository workflow.
- OIDC permission is scoped to the two publication jobs; build jobs do not receive `id-token: write`.
- Third-party GitHub Actions in the publishing workflow are pinned to immutable commit SHAs.
- Release tag version must equal package metadata before publication.
- Release artifacts are clean-install tested before publication.
- npm public packages published through Trusted Publishing from this public GitHub repository receive npm provenance automatically under current npm behavior.

## Failure policy

A failed package publication does not change SeenRelay service availability or CHECK/OBSERVE semantics. Do not change the website to claim `npm install seenrelay` or `pip install seenrelay` until the corresponding registry confirms the package and a clean public installation succeeds.
