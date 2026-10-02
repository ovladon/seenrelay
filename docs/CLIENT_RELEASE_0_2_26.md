# SeenRelay client 0.2.26 release candidate

Release intent: `clients-v0.2.26`

This patch adds one JavaScript / TypeScript local-only CLI surface:

```bash
npx seenrelay savings-report <fleet-ledger.json|fleet-receipts.jsonl> [--overhead-usd N] [--json]
```

The command converts active fleet coordination evidence into a conservative **Savings Report** / machine-readable **Verified Savings Record**.

It may report:
- actual avoided executions, only from recorded follower reuse;
- gross avoided cost when explicit cost provenance exists;
- measured SeenRelay overhead when the caller supplies it;
- local net savings only when gross cost coverage is complete and overhead was explicitly supplied.

It deliberately does **not**:
- contact SeenRelay;
- upload the input;
- create a USE verdict;
- claim native/SOTA superiority;
- claim external customer adoption or customer ROI;
- create an invoice, payment receipt or payment obligation;
- enable billing or reuse.

Uncosted follower reuse remains measurable without inventing dollar values. Partial cost coverage is labeled partial.

Python is version-synchronized at 0.2.26 for the coupled trusted-publishing pipeline and is behaviorally unchanged.

No hosted CHECK/OBSERVE, database, billing, MCP protocol, Hive or production-runtime semantics change in this client patch.
