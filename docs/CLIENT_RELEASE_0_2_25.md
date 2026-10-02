# SeenRelay client 0.2.25 release candidate

Release intent: `clients-v0.2.25`

This patch adds one JavaScript / TypeScript CLI convenience surface:

```bash
npx seenrelay guide . --json
```

`guide` composes the existing local-only `scan` and `adopt-plan` primitives into one non-mutating result for agents/operators. It returns:
- static prescreen evidence;
- the existing adoption plan;
- the next bounded action;
- trust / agent-adoption / proof metadata URLs.

It does **not**:
- upload source code;
- contact SeenRelay;
- modify the scanned project;
- enable reuse;
- authorize suppression;
- return a SeenRelay USE verdict.

Python is version-synchronized at 0.2.25 for the coupled trusted-publishing pipeline and is behaviorally unchanged.

No hosted CHECK/OBSERVE, database, billing, MCP protocol, Hive or production-runtime semantics change in this client patch.
