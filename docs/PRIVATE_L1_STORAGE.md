# Private L1 storage contract

SeenRelay private L1 is an optional caller-owned storage layer for repeated read-only validation work across workers or process restarts.

It is not the public SeenRelay network and it does not create another SeenRelay domain operation.

## Required contract

A private L1 configuration must provide both:

- `privateStore.get(key)` / `privateStore.set(key, sealedValue)`;
- `privateCodec.open(sealedValue, key)` / `privateCodec.seal(entry, key)`.

The client refuses a store without a codec or a codec without a store.

The built-in codec is `createAesGcmPrivateCodec(keyMaterial)`. It requires exactly 32 bytes and uses AES-256-GCM. The opaque coordinate key is authenticated as AAD so sealed entries cannot be moved safely between coordinates.

## Store visibility

The storage backend receives:

- an opaque `sha256:<hex>` coordinate key;
- a sealed payload string.

The backend does not need the raw coordinate or plaintext result.

The encryption key remains outside the store contract. Applications should load it from their own secret-management boundary and rotate it according to their operational policy. Rotation can intentionally make older entries unreadable; unreadable entries fail open to normal validation.

## Freshness semantics

Private completed-result reuse is disabled by default (`privateMaxAgeMs = 0`). A caller must explicitly set a positive window before an L1 value can suppress source validation.

With `privateMaxAgeMs = 0`, a result carrying ETag or Last-Modified may still be stored encrypted. Another worker may then perform conditional source validation. A source `304 Not Modified` refreshes the receipt; the private value itself was not trusted as fresh.

## Failure semantics

Private-store reads, writes, decrypt failures, malformed entries and key-rotation misses are optimization failures, not application failures. They do not suppress or replace the original validator.

No private L1 reuse is emitted as OBSERVE merely because it was read from private storage. OBSERVE remains tied to independently obtained source-backed validation.
