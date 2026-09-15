#!/usr/bin/env bash
set -euo pipefail

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Fail open: if Vercel cannot provide a usable previous commit, build.
if [[ -z "$previous" || "$previous" =~ ^0+$ ]] || ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  exit 1
fi

changed="$(git diff --name-only "$previous" "$current")"

# The readiness deployment imports shared src modules and three public assets from repo root.
# Everything else (research, tests, docs, unrelated scripts/workflows) can skip this build.
if grep -Eq '^(deploy/readiness/|src/|public/(revamp\.css|readiness\.css|readiness\.js)$|package\.json$|package-lock\.json$|tsconfig\.json$|tsconfig\.core\.json$|scripts/vercel-ignore-readiness\.sh$)' <<<"$changed"; then
  exit 1
fi

exit 0
