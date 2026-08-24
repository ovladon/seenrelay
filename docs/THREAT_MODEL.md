# Threat Model

## Primary risks

### Sybil / poisoning
Many reports do not equal many independent observers. `observer_id` is self-asserted and anonymous network hints are not identity proof. Responses must expose evidence counts without implying independence stronger than supported.

### Canonicalization fragmentation
Different agents may describe the same property differently, preventing useful sharing. V1 deliberately requires stable machine identifiers and does not merge natural-language claims automatically.

### False canonical merge
Over-aggressive normalization could combine different facts. V1 prefers fragmentation over unsafe merging.

### Replay / write amplification
Idempotency keys, per-observer dedup windows, body bounds and bounded cleanup reduce accidental or adversarial amplification.

### Denial of wallet
The launch has no paid external API calls, no LLM, and no external verification. Vercel spend limits and firewall/rate controls should be configured before public registry publication.

### Privacy
Do not store raw pages or unnecessary personal data. Anonymous observer hints are salted hashes. Production must use a secret high-entropy `PRIVACY_SALT`.

### Truth overclaim
The service reports observations only. `SAME_OBSERVED` is not a certification that a fact is universally true.
