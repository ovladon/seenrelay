#!/usr/bin/env bash
set -Eeuo pipefail

# Early-value contract: one integration can seed its own later CHECKs, and fresh CHECKs can
# carry an observer-supplied source validator without SeenRelay claiming to verify it.
EV_SOURCE="${BASE}/early-value"
ev=("${json[@]}" -H "x-seenrelay-client: release-self-${RUN_KEY}" -H "x-seenrelay-test-network: network-self-${RUN_KEY}")

cat >/tmp/ev-check.json <<JSON
{"fact":{"subject":"Early value","predicate":"status.current","source":"${EV_SOURCE}"},"known_value":"ready","max_age_seconds":3600}
JSON
post ev /tmp/ev-check.json /v1/check /tmp/ev-check0.json
node - <<'NODE'
const fs = require('fs');
const x = JSON.parse(fs.readFileSync('/tmp/ev-check0.json', 'utf8'));
if (x.status !== 'UNKNOWN') throw new Error(`expected UNKNOWN, got ${x.status}`);
if (x.next_step !== 'VALIDATE_THEN_OBSERVE') throw new Error('missing VALIDATE_THEN_OBSERVE guidance');
if (x.accepted_observation_can_answer_later_checks !== true) throw new Error('missing bootstrap reuse contract');
NODE

cat >/tmp/ev-observe.json <<JSON
{"fact":{"subject":"Early value","predicate":"status.current","source":"${EV_SOURCE}"},"value":"ready","observer_id":"release-self","idempotency_key":"early-value","source_validator":{"kind":"etag","value":"\"seenrelay-${RUN_KEY}\""}}
JSON
post ev /tmp/ev-observe.json /v1/observe /tmp/ev-observe.out
node - <<'NODE'
const fs = require('fs');
const x = JSON.parse(fs.readFileSync('/tmp/ev-observe.out', 'utf8'));
if (x.accepted !== true) throw new Error('early-value OBSERVE was not accepted');
if (x.future_check_eligible !== true) throw new Error('accepted observation not marked future-check eligible');
if (x.source_validator_recorded !== true) throw new Error('validator not recorded');
NODE

# Same client + same conservative network bucket: this proves single-integration reuse without
# pretending it is qualified cross-client reuse.
post ev /tmp/ev-check.json /v1/check /tmp/ev-check1.json
node - <<'NODE'
const fs = require('fs');
const x = JSON.parse(fs.readFileSync('/tmp/ev-check1.json', 'utf8'));
if (x.status !== 'SAME_OBSERVED') throw new Error(`expected SAME_OBSERVED, got ${x.status}`);
if (x.source_validator?.kind !== 'etag') throw new Error('missing ETag validator');
if (x.source_validator_assurance !== 'observer_supplied_unverified') throw new Error('validator assurance boundary missing');
if (x.conditional_request_hint?.request_header !== 'If-None-Match') throw new Error('missing If-None-Match hint');
if (x.useful_reuse_awards !== 0) throw new Error('same integration must not earn qualified cross-client reuse');
NODE
