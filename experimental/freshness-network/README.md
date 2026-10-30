# Experimental field-level freshness mirror v1 — NOT deployed

Status: isolated deterministic kernel, no server/API integration, no data collection, no marketplace activation.

This folder contains a content-free snapshot builder, hierarchical keyed branch hashing, observation-to-observation comparison and local agent-interest evaluation. It is an implementation candidate for the SeenRelay Freshness Network, not a new production operation or a public promise of live field-level coverage.

## Existing components reused conceptually

- Fact identity remains SeenRelay fact-v3: callers must first derive the stable root fact key through existing canonicalization.
- Leaf fingerprints are already-scoped server-keyed h1 SHA-256 HMAC values from existing SeenRelay fingerprint logic. This module NEVER accepts a source value or raw page.
- CHECK and OBSERVE remain the only present public domain operations. No automatic suppression of an authoritative call is authorized.
- Source rights, independent provenance, tenant/qualifier separation, economic eligibility, transport assurance and native controls are higher-level conditions; this module cannot waive them.

## Input and output

buildFieldMirror receives:

- rootFactKey, an existing canonical hexadecimal 64-character fact identity;
- hashKey, a server-side high-entropy secret (minimum 32 bytes, never returned);
- keyId for key-rotation comparability, profileId for extraction/normalization version, and scopeId for rights/tenant comparability; opaque identifiers only;
- observedAt and a declared completeness mode (complete means complete for that extraction profile, not the internet or intervening history);
- an array of source-native JSON Pointer paths, existing keyed leaf fingerprints, and explicit unknown/unobserved states.

All input property names are allowlisted. A raw value, URL, page content, secret field attached to a leaf, unauthorized extra field, invalid path, duplicate leaf, or ambiguous leaf/parent combination is rejected.

The resulting snapshot includes canonical structural paths, metadata and keyed fingerprints only. The source hashKey is intentionally excluded. Do not log, upload or expose confidential paths, scopes or interest manifests without a separately approved privacy policy. Opaque identifiers and hashes can still be linkable metadata.

Merkle parents are HMAC-SHA256 over domain, fact identity, rotation/key identifiers, extraction/scope identifiers, parent path and ordered child identity+fingerprints. This yields m1 fingerprints, while leaves keep the existing h1 format. Comparison requires exactly compatible root, key epoch, extractor profile and rights scope. Cross-provider semantic equivalence is NEVER assumed.

Only two observed snapshots are compared. SAME_OBSERVED does not establish intervening stability or source truth. CHANGED_OBSERVED identifies a field path, not its new value, direction or numeric delta. ADDED_OBSERVED/REMOVED_OBSERVED are inferred only when BOTH extraction runs claim complete coverage of the same declared profile; confidence in that coverage remains a separate producer/provenance concern. Partial gaps are UNOBSERVED and explicit missing evidence is UNKNOWN. Incompatible snapshots are INCOMPARABLE.

## Agent interests and decision impact

The local-only agent manifest allows an exact watched field list, maximum age, required flag and whether the buyer actually needs the source value. A manifest is NOT automatically sent to SeenRelay; minimal opt-in disclosure is future policy work, not present upload behavior.

The advisory result CANDIDATE_ONLY_NOT_AUTHORIZED is deliberately weaker than permission to reuse or act. A consumer lacking the value receives AUTHORITATIVE_VALUE_REQUIRED, never content synthesized from hashes. Any actual qualified value delivery must be independently permitted, transient, seller-originated and assured; this kernel neither brokers nor stores such payloads. The existing agent-only market sandbox remains separate.

## Acceptance and deferral

Tests cover stable ordering, precise changed vs unchanged leaves, added/removed/unknown/unobserved, cross-scope/profile/key incompatibility, raw-content rejection, freshness failures, and rejection of source-value fabrication.

Before any production integration: A1 (Runtime / Autopilot) owns protocol compatibility; A2 (Evidence / Delta) verifies timestamp/evidence semantics; A4 (Security / Privacy / Reliability) reviews rights and key/metadata threats; A12 (Product Integrity / Non-Regression Guardian) must verify compatibility; A3 (Economics / Marketplace) reviews both market consumption modes separately. No source content must enter the shared mirror or old backups. No public endpoint, feature flag or database schema is changed here.

Run the isolated tests with:

    node --test tests/freshness-network-field-mirror.test.mjs

This is G0/G1 groundwork only. It does not demonstrate external customers, cross-provider coverage, net savings, predictive utility, legal resale rights or market liquidity.
