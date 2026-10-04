#!/usr/bin/env bash
set -euo pipefail

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Fail open: if Vercel cannot provide a usable previous commit, build.
if [[ -z "$previous" || "$previous" =~ ^0+$ ]] || ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  exit 1
fi

changed="$(git diff --name-only "$previous" "$current")"

# Rebuild only for the readiness deployment root, its current transitive src dependencies,
# the copied browser assets, or shared package/TypeScript inputs. CI verifies that every
# relative import reachable from deploy/readiness/src/index.ts remains represented here.
if grep -Eq '^(deploy/readiness/|src/readiness-service\.ts$|src/readiness-admission-db\.ts$|src/http\.ts$|src/readiness\.ts$|src/readiness-presentation\.ts$|src/readiness-v2-activation\.ts$|src/version\.ts$|src/canonical\.ts$|src/readiness-network\.ts$|src/readiness-v2\.ts$|src/types\.ts$|src/hive-admission-db\.ts$|src/identity\.ts$|src/traffic-classification\.ts$|public/(revamp\.css|readiness\.css|readiness\.js)$|package\.json$|package-lock\.json$|tsconfig\.json$|tsconfig\.core\.json$|scripts/vercel-ignore-readiness\.sh$)' <<<"$changed"; then
  exit 1
fi

exit 0
