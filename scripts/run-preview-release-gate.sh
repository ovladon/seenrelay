#!/usr/bin/env bash
set -Eeuo pipefail

curl() {
  command curl --connect-timeout 10 --max-time 30 --retry 1 --retry-delay 1 "$@"
}

trap 'rc=$?; echo "Preview release gate failed: rc=${rc} source=${BASH_SOURCE[*]} lineno=${LINENO} stack=${BASH_LINENO[*]} command=${BASH_COMMAND}" >&2; if [ -f /tmp/product-facts.json ]; then echo "product-facts-response:" >&2; cat /tmp/product-facts.json >&2; echo >&2; fi; if [ -f /tmp/auth-url-out.json ]; then echo "auth-url-response:" >&2; cat /tmp/auth-url-out.json >&2; echo >&2; fi; exit "$rc"' ERR

source scripts/preview-release-gate.sh
source scripts/preview-early-value-gate.sh
