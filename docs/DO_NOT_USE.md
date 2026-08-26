# When not to use SeenRelay

Do not put SeenRelay in front of a validation merely because the integration is available.

Avoid or remove the preflight when the protected operation is a cheap one-off fetch, the fact rarely repeats, an equivalent authoritative shared cache already exists, the caller must perform authoritative live validation on every request with no useful conditional shortcut, or measured fleet reuse remains below the workload's cost/latency break-even threshold.

SeenRelay should remain only where measured operational value is positive.
