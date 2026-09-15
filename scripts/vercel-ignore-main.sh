#!/usr/bin/env bash
set -euo pipefail

previous="${VERCEL_GIT_PREVIOUS_SHA:-}"
current="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

# Fail open: if Vercel cannot provide a usable previous commit, build.
if [[ -z "$previous" || "$previous" =~ ^0+$ ]] || ! git cat-file -e "${previous}^{commit}" 2>/dev/null; then
  exit 1
fi

# Build only when Production runtime/configuration inputs changed.
if git diff --name-only "$previous" "$current" -- \
  src/ \
  public/ \
  migrations/ \
  registry/ \
  package.json \
  package-lock.json \
  tsconfig.json \
  tsconfig.core.json \
  vercel.json \
  mcp.json \
  plugin.json \
  scripts/vercel-ignore-main.sh \
  | grep -q .; then
  exit 1
fi

exit 0
