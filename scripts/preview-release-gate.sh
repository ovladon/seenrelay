#!/usr/bin/env bash
set -Eeuo pipefail

: "${PREVIEW_URL:?PREVIEW_URL is required}"
: "${RELEASE_SHA:?RELEASE_SHA is required}"

bypass=()
if [ -n "${BYPASS_SECRET:-}" ]; then bypass=(-H "x-vercel-protection-bypass: $BYPASS_SECRET"); fi
json=(-H 'content-type: application/json' "${bypass[@]}")

wait_for_exact_deployment() {
  local stable=0 code
  for _ in $(seq 1 60); do
    code=$(curl -sS "${bypass[@]}" -o /tmp/health.json -w '%{http_code}' "$PREVIEW_URL/healthz" || true)
    if [ "$code" = 200 ] \
      && grep -q '"ok":true' /tmp/health.json \
      && grep -q '"billing_enabled":false' /tmp/health.json \
      && grep -q '"environment":"preview"' /tmp/health.json \
      && grep -q "\"deployment_sha\":\"${RELEASE_SHA}\"" /tmp/health.json; then
      stable=$((stable + 1))
      [ "$stable" -ge 5 ] && return 0
    else
      stable=0
    fi
    sleep 5
  done
  cat /tmp/health.json >&2 || true
  return 1
}

post() {
  local headers_name=$1 payload=$2 endpoint=$3 output=$4
  local -n headers="$headers_name"
  curl -fsS "${headers[@]}" --data-binary "@$payload" "$PREVIEW_URL$endpoint" >"$output"
}

wait_for_exact_deployment
cat /tmp/health.json

# Public, machine, admin-boundary and billing-disabled surfaces.
curl -fsS "${bypass[@]}" -D /tmp/root.headers "$PREVIEW_URL/" -o /tmp/root.json
grep -qi '^vary:.*Accept' /tmp/root.headers
grep -q '"operations":\["CHECK","OBSERVE"\]' /tmp/root.json
grep -q '"billing_enabled":false' /tmp/root.json
curl -fsS "${bypass[@]}" -H 'accept: text/html' -D /tmp/site.headers "$PREVIEW_URL/" -o /tmp/site.html
grep -qi '^content-security-policy:' /tmp/site.headers
grep -q 'FRESHNESS INFRASTRUCTURE FOR AGENT FLEETS' /tmp/site.html
curl -fsS "${bypass[@]}" "$PREVIEW_URL/service.json" -o /tmp/service.json
grep -q '"fact_identity":"seenrelay-fact-v3"' /tmp/service.json
grep -q '"external_verification":false' /tmp/service.json
grep -q '"billing_enabled":false' /tmp/service.json
curl -fsS "${bypass[@]}" "$PREVIEW_URL/openapi.json" -o /tmp/openapi.json
grep -q '"openapi":"3.1.0"' /tmp/openapi.json
curl -fsS "${bypass[@]}" "$PREVIEW_URL/data-practices.json" -o /tmp/data.json
grep -q '"reserved_test_namespace_production_guard":true' /tmp/data.json
curl -fsS "${bypass[@]}" "$PREVIEW_URL/public-stats.json?gate=surface" -o /tmp/stats0.json
grep -q '"qualified_reuse_rate"' /tmp/stats0.json
code=$(curl -sS "${bypass[@]}" -o /tmp/billing.json -w '%{http_code}' "$PREVIEW_URL/v1/billing/test")
test "$code" = 404
grep -q 'BILLING_DISABLED' /tmp/billing.json
curl -fsS "${bypass[@]}" "$PREVIEW_URL/admin" -o /tmp/admin.html
grep -q 'SeenRelay Control Room' /tmp/admin.html
code=$(curl -sS "${bypass[@]}" -o /tmp/admin-api.json -w '%{http_code}' "$PREVIEW_URL/admin/api/operations-export")
test "$code" = 401
grep -q 'ADMIN_UNAUTHORIZED' /tmp/admin-api.json
code=$(curl -sS "${json[@]}" -o /tmp/login.json -w '%{http_code}' --data '{"secret":"release-gate-definitely-wrong"}' "$PREVIEW_URL/admin/login")
test "$code" = 401
grep -q 'ADMIN_UNAUTHORIZED' /tmp/login.json

RUN_KEY="release-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
BASE="https://example.com/seenrelay-e2e/${RUN_KEY}"
a=("${json[@]}" -H "x-seenrelay-client: release-a-${RUN_KEY}" -H "x-seenrelay-test-network: network-a-${RUN_KEY}")
b=("${json[@]}" -H "x-seenrelay-client: release-b-${RUN_KEY}" -H "x-seenrelay-test-network: network-b-${RUN_KEY}")
c=("${json[@]}" -H "x-seenrelay-client: release-c-${RUN_KEY}" -H "x-seenrelay-test-network: network-c-${RUN_KEY}")

# UNKNOWN -> OBSERVE -> SAME -> reward exactly once -> CHANGED -> dedup.
cat >/tmp/check.json <<JSON
{"fact":{"subject":"Release fact","predicate":"status.current","source":"${BASE}/core"},"known_value":"green","max_age_seconds":3600}
JSON
post b /tmp/check.json /v1/check /tmp/check0.json
grep -q '"status":"UNKNOWN"' /tmp/check0.json
cat >/tmp/observe.json <<JSON
{"fact":{"subject":"Release fact","predicate":"status.current","source":"${BASE}/core"},"value":"green","observer_id":"release-observer-a","idempotency_key":"first"}
JSON
post a /tmp/observe.json /v1/observe /tmp/observe1.json
grep -q '"accepted":true' /tmp/observe1.json
post b /tmp/check.json /v1/check /tmp/check1.json
grep -q '"status":"SAME_OBSERVED"' /tmp/check1.json
grep -q '"useful_reuse_awards":1' /tmp/check1.json
post b /tmp/check.json /v1/check /tmp/check2.json
grep -q '"useful_reuse_awards":0' /tmp/check2.json
post a /tmp/observe.json /v1/observe /tmp/observe2.json
grep -q '"deduplicated":true' /tmp/observe2.json
cat >/tmp/changed.json <<JSON
{"fact":{"subject":"Release fact","predicate":"status.current","source":"${BASE}/core"},"known_value":"red","max_age_seconds":3600}
JSON
post c /tmp/changed.json /v1/check /tmp/changed.json.out
grep -q '"status":"CHANGED_OBSERVED"' /tmp/changed.json.out

# Self-declared client labels behind one conservative network bucket cannot farm reward.
same_a=("${json[@]}" -H "x-seenrelay-client: same-a-${RUN_KEY}" -H "x-seenrelay-test-network: same-egress-${RUN_KEY}")
same_b=("${json[@]}" -H "x-seenrelay-client: same-b-${RUN_KEY}" -H "x-seenrelay-test-network: same-egress-${RUN_KEY}")
cat >/tmp/same-observe.json <<JSON
{"fact":{"subject":"Same network anti-farm","predicate":"status.current","source":"${BASE}/same-network"},"value":"ok","observer_id":"same-a","idempotency_key":"same-a"}
JSON
post same_a /tmp/same-observe.json /v1/observe /tmp/same-observe.out
grep -q '"accepted":true' /tmp/same-observe.out
cat >/tmp/same-check.json <<JSON
{"fact":{"subject":"Same network anti-farm","predicate":"status.current","source":"${BASE}/same-network"},"known_value":"ok","max_age_seconds":3600}
JSON
post same_b /tmp/same-check.json /v1/check /tmp/same-check.out
grep -q '"status":"SAME_OBSERVED"' /tmp/same-check.out
grep -q '"useful_reuse_awards":0' /tmp/same-check.out

# CONTESTED and STALE.
cat >/tmp/contest-a.json <<JSON
{"fact":{"subject":"Contest","predicate":"status.current","source":"${BASE}/contest"},"value":"alpha","observer_id":"contest-a","idempotency_key":"a"}
JSON
cat >/tmp/contest-b.json <<JSON
{"fact":{"subject":"Contest","predicate":"status.current","source":"${BASE}/contest"},"value":"beta","observer_id":"contest-b","idempotency_key":"b"}
JSON
post a /tmp/contest-a.json /v1/observe /tmp/contest-a.out
post b /tmp/contest-b.json /v1/observe /tmp/contest-b.out
cat >/tmp/contest-check.json <<JSON
{"fact":{"subject":"Contest","predicate":"status.current","source":"${BASE}/contest"},"known_value":"alpha","max_age_seconds":3600}
JSON
post c /tmp/contest-check.json /v1/check /tmp/contest.out
grep -q '"status":"CONTESTED"' /tmp/contest.out
OLD=$(date -u -d '10 seconds ago' +%Y-%m-%dT%H:%M:%SZ)
cat >/tmp/stale-observe.json <<JSON
{"fact":{"subject":"Stale","predicate":"version.current","source":"${BASE}/stale"},"value":"old","observed_at":"${OLD}","observer_id":"stale-a","idempotency_key":"stale"}
JSON
post a /tmp/stale-observe.json /v1/observe /tmp/stale-observe.out
cat >/tmp/stale-check.json <<JSON
{"fact":{"subject":"Stale","predicate":"version.current","source":"${BASE}/stale"},"known_value":"old","max_age_seconds":1}
JSON
post b /tmp/stale-check.json /v1/check /tmp/stale.out
grep -q '"status":"STALE"' /tmp/stale.out

# Locator convergence and credential-bearing source rejection before stateful admission.
cat >/tmp/loc-observe.json <<JSON
{"fact":{"subject":"Price","predicate":"price.current","source":"https://example.com/seenrelay-e2e/${RUN_KEY}/locator?utm_source=ci&b=2&a=1#x","locator":{"scheme":"element_id","value":"stable-value"}},"value":17,"observer_id":"loc-a","idempotency_key":"loc"}
JSON
post a /tmp/loc-observe.json /v1/observe /tmp/loc-observe.out
cat >/tmp/loc-check.json <<JSON
{"fact":{"subject":"Different label","predicate":"availability.current","source":"https://EXAMPLE.com:443/seenrelay-e2e/${RUN_KEY}/locator?a=1&b=2","locator":{"scheme":"element_id","value":"stable-value"}},"known_value":17,"max_age_seconds":3600}
JSON
post b /tmp/loc-check.json /v1/check /tmp/loc.out
grep -q '"status":"SAME_OBSERVED"' /tmp/loc.out
grep -q '"fact_identity_basis":"source_locator"' /tmp/loc.out
cat >/tmp/auth-url.json <<JSON
{"fact":{"subject":"Credential URL rejection","predicate":"status.current","source":"https://example.com/seenrelay-e2e/${RUN_KEY}/secret?access_token=do-not-store"},"known_value":"x"}
JSON
code=$(curl -sS "${b[@]}" -o /tmp/auth-url.out -w '%{http_code}' --data-binary @/tmp/auth-url.json "$PREVIEW_URL/v1/check")
test "$code" = 400
grep -q 'authentication or signature query parameters' /tmp/auth-url.out

# MCP 2026-07-28 discover/list/CHECK/OBSERVE/CHECK.
MCP_SOURCE="https://example.com/seenrelay-mcp-e2e/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
meta='"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"release-gate","version":"1.0.0"},"io.modelcontextprotocol/clientCapabilities":{}}'
mcp=(-H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2026-07-28' "${bypass[@]}")
printf '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{%s}}' "$meta" >/tmp/discover.json
curl -fsS "${mcp[@]}" -H 'Mcp-Method: server/discover' --data-binary @/tmp/discover.json "$PREVIEW_URL/mcp" >/tmp/discover.out
grep -q 'seenrelay' /tmp/discover.out
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{%s}}' "$meta" >/tmp/list.json
curl -fsS "${mcp[@]}" -H 'Mcp-Method: tools/list' --data-binary @/tmp/list.json "$PREVIEW_URL/mcp" >/tmp/list.out
grep -q 'check_fact' /tmp/list.out
grep -q 'observe_fact' /tmp/list.out
printf '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"check_fact","arguments":{"fact":{"subject":"MCP","predicate":"version.current","source":"%s"},"known_value":"mcp-alpha","max_age_seconds":3600},%s}}' "$MCP_SOURCE" "$meta" >/tmp/mcp-check.json
curl -fsS "${mcp[@]}" -H 'Mcp-Method: tools/call' -H 'Mcp-Name: check_fact' --data-binary @/tmp/mcp-check.json "$PREVIEW_URL/mcp" >/tmp/mcp-check.out
grep -q 'UNKNOWN' /tmp/mcp-check.out
printf '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"observe_fact","arguments":{"fact":{"subject":"MCP","predicate":"version.current","source":"%s"},"value":"mcp-alpha","observer_id":"release-mcp","idempotency_key":"mcp-first"},%s}}' "$MCP_SOURCE" "$meta" >/tmp/mcp-observe.json
curl -fsS "${mcp[@]}" -H 'Mcp-Method: tools/call' -H 'Mcp-Name: observe_fact' --data-binary @/tmp/mcp-observe.json "$PREVIEW_URL/mcp" >/tmp/mcp-observe.out
grep -q '"accepted":true' /tmp/mcp-observe.out
printf '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"check_fact","arguments":{"fact":{"subject":"MCP","predicate":"version.current","source":"%s"},"known_value":"mcp-alpha","max_age_seconds":3600},%s}}' "$MCP_SOURCE" "$meta" >/tmp/mcp-check2.json
curl -fsS "${mcp[@]}" -H 'Mcp-Method: tools/call' -H 'Mcp-Name: check_fact' --data-binary @/tmp/mcp-check2.json "$PREVIEW_URL/mcp" >/tmp/mcp-check2.out
grep -q 'SAME_OBSERVED' /tmp/mcp-check2.out

# Two contributor awards from one CHECK count as exactly one qualified-reuse CHECK.
curl -fsS "${bypass[@]}" "$PREVIEW_URL/public-stats.json?gate=${RUN_KEY}-before" -o /tmp/kpi-before.json
cat >/tmp/kpi-a.json <<JSON
{"fact":{"subject":"KPI reuse","predicate":"status.current","source":"${BASE}/kpi-reuse"},"value":"fresh","observer_id":"kpi-a","idempotency_key":"kpi-a"}
JSON
cat >/tmp/kpi-c.json <<JSON
{"fact":{"subject":"KPI reuse","predicate":"status.current","source":"${BASE}/kpi-reuse"},"value":"fresh","observer_id":"kpi-c","idempotency_key":"kpi-c"}
JSON
post a /tmp/kpi-a.json /v1/observe /tmp/kpi-a.out
post c /tmp/kpi-c.json /v1/observe /tmp/kpi-c.out
cat >/tmp/kpi-check.json <<JSON
{"fact":{"subject":"KPI reuse","predicate":"status.current","source":"${BASE}/kpi-reuse"},"known_value":"fresh","max_age_seconds":3600}
JSON
post b /tmp/kpi-check.json /v1/check /tmp/kpi-check.out
grep -q '"status":"SAME_OBSERVED"' /tmp/kpi-check.out
grep -q '"useful_reuse_awards":2' /tmp/kpi-check.out
curl -fsS "${bypass[@]}" "$PREVIEW_URL/public-stats.json?gate=${RUN_KEY}-after" -o /tmp/kpi-after.json
node -e "const fs=require('fs');const a=JSON.parse(fs.readFileSync('/tmp/kpi-before.json','utf8'));const b=JSON.parse(fs.readFileSync('/tmp/kpi-after.json','utf8'));if(b.useful_reuse_month!==a.useful_reuse_month+1)process.exit(1);if(!(b.qualified_reuse_rate>=0&&b.qualified_reuse_rate<=1))process.exit(1)"

curl -fsS "${bypass[@]}" "$PREVIEW_URL/public-stats.json?gate=${RUN_KEY}-final" -o /tmp/stats-after.json
cat /tmp/stats-after.json
node -e "const fs=require('fs');const x=JSON.parse(fs.readFileSync('/tmp/stats-after.json','utf8'));if(!(x.facts>0&&x.checks_month>0&&x.observes_month>0&&x.qualified_reuse_rate>=0&&x.qualified_reuse_rate<=1))process.exit(1)"
