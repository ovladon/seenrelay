# SeenRelay free shadow audit

Use this audit to determine whether a real agent/application workload is repeating expensive **read-only validation** often enough for any SeenRelay reuse path to deserve a place in the stack.

The audit is intentionally safe and falsifiable:

- every authoritative validation stays enabled;
- active SeenRelay reuse stays disabled during measurement;
- stronger local, source-native and provider-native mechanisms stay ahead of SeenRelay;
- a negative result is valid and should leave SeenRelay out of the workload;
- no account or API key is required;
- local measurement can be performed without exporting raw values, credentials, private fact identities or sensitive payloads.

## Fastest path: coding agent

Install the published Agent Skill from the canonical domain:

```bash
npx skills add https://seenrelay.com --skill seenrelay --yes
```

Then give the coding agent this task:

```text
Run a SeenRelay shadow audit on this project.

Find one or more repeated expensive read-only validations. Preserve every authoritative call. Keep stronger local, source-native and provider-native controls ahead of SeenRelay. Do not enable active reuse.

For each candidate workload, report:
- exact workload/operation identity and why it is read-only;
- protected-call count;
- exact-repeat count;
- local/source/provider-native control hits;
- SAME_OBSERVED / UNKNOWN / other CHECK outcomes where shared CHECK is measured;
- any hypothetical-reuse mismatch against the authoritative result;
- authoritative baseline latency/cost/capacity unit;
- prospective SeenRelay latency/cost under the same semantics;
- a final USE / DO NOT USE / INSUFFICIENT EVIDENCE verdict.

Do not expose raw values, credentials, secrets, signed URLs, private fact identities or unnecessary sensitive payloads.
```

The skill must use only supported adapters and must leave an unsupported framework/path unchanged rather than inventing an interceptor.

## Existing MCP-style JavaScript / TypeScript client

```bash
npm install seenrelay
```

```js
import { ambientMcpClient } from 'seenrelay/ambient';

const client = ambientMcpClient(rawMcpClient);

// Run the existing workload normally.
console.log(client.seenRelayAmbient.getReport());
```

Ambient mode is measurement-first. It does not authorize active reuse merely because an exact repeat appears.

## Existing MCP-style Python client

```bash
pip install seenrelay
```

```python
from seenrelay_ambient import ambient_mcp_client

client = ambient_mcp_client(raw_mcp_client)

# Run the existing workload normally.
print(client.get_report())
```

Python 0.2.11 also supports bounded sanitized natural-workload evidence export and hostile economics evaluation through `seenrelay_economics`, while authoritative validation remains mandatory during the measurement window.

## What counts as a useful audit

A useful audit answers four questions for one exact workload.

### 1. Does the exact work repeat?

Measure deterministic recurrence in the real workload. Do not infer a hit rate from a synthetic benchmark or from another project.

### 2. Does a stronger native mechanism already solve it?

Measure the best equivalent path first, including where applicable:

- in-process/in-flight reuse;
- caller-owned local/private state;
- ETag / Last-Modified or another source-native validator;
- provider-native cache;
- authoritative shared cache already owned by the application.

If one of these answers the same user-relevant question more cheaply or more strongly, it wins.

### 3. Would hypothetical reuse preserve the authoritative outcome?

During Shadow Proof every original validation still runs. Any genuine mismatch is a safety failure for that workload/policy and blocks admission.

### 4. Are the economics positive after overhead?

Compare the same semantics and the same unit of work.

```text
net value
= authoritative work actually avoidable
- SeenRelay/client overhead
- fallback work still required
- integration/operating cost
- risk cost imposed by the workload policy
```

Provider-path savings do not count when a cheaper native path already avoids the same work.

## Verdicts

### USE

Only when the measured workload has material exact recurrence, authoritative outcome equivalence, a defensible freshness policy and positive net economics after the best-native control.

Prefer the narrowest bounded path:

1. in-flight/local reuse;
2. caller-owned private L1 across workers/restarts;
3. source-native confirmation;
4. provider-native cache when it solves the same semantics;
5. optional shared SeenRelay CHECK when it adds value;
6. original authoritative validation as fallback.

### DO NOT USE

Use this verdict when repetition is sparse, the operation is cheap, an equivalent native/cache path already wins, the operation is mutating/destructive, freshness policy requires a brand-new live validation every time, or hypothetical reuse does not preserve the authoritative result.

### INSUFFICIENT EVIDENCE

Use this verdict when the sample is too small, cost/latency units are incomparable, timing attribution is ambiguous, native controls were not measured, or safety equivalence cannot be established.

## Reporting and privacy

The audit should retain only what is needed to decide workload fit. Sanitized benchmark records should exclude raw values, fact identities, source payloads and per-call timestamps unless the caller explicitly chooses otherwise for its own local analysis.

Package downloads, MCP initialization/tool listing, CI activity and SeenRelay first-party Reference Observer traffic are not external adoption evidence.

## Next step after a positive audit

See the current fleet deployment pattern at:

https://seenrelay.com/fleet

Shared CHECK is optional. A positive private/local reuse result does not require public network coverage.
