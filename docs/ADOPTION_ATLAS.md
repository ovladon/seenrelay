# Adoption Atlas

SeenRelay cannot truthfully infer all local-only use from hosted traffic. Adoption Atlas therefore triangulates independent signals instead of pretending that package installs, directory installs, hosted CHECK/OBSERVE traffic, or voluntary reports are the same thing.

## Opt-in local report

The JavaScript / TypeScript CLI includes:

```bash
seenrelay adoption-report \
  --integration-class mcp \
  --deployment local \
  --mode shadow \
  --decision INSUFFICIENT \
  --workload-class mcp-tools
```

Without `--share`, the command is a local preview and makes no SeenRelay network request.

To contribute one voluntary aggregate signal:

```bash
seenrelay adoption-report \
  --integration-class mcp \
  --deployment local \
  --mode shadow \
  --decision INSUFFICIENT \
  --workload-class mcp-tools \
  --share
```

## Data boundary

The application payload contains only:

- SeenRelay version;
- integration class;
- deployment class: `local`, `hosted`, or `private-l1`;
- `shadow` or `active`;
- `USE`, `DO_NOT_USE`, or `INSUFFICIENT`;
- coarse workload class.

The application schema accepts no actor identifier, repository, filename, prompt, response, source URL, fact/value, customer identity, or user-agent field. The database stores no individual report rows. It increments one daily aggregate cell keyed only by those coarse dimensions.

Normal HTTP transport necessarily reaches the hosting/network layer, but the SeenRelay application does not persist or use source IP as identity for Adoption Atlas.

## Claim boundary

Adoption Atlas reports are voluntary and unverified. They are not deduplicated and therefore do not establish unique users, companies, customers, ROI, or geography.

They are one input to triangulation alongside independently measured hosted protocol activity, package/download signals, directory/install counters, GitHub/distribution signals, and qualified external reuse.

No client-only usage becomes visible unless a user explicitly opts in with `--share`.


## Adoption Atlas v1 triangulation

The Control Room now combines four evidence classes without collapsing them into a user count:

1. **Direct hosted** — Production CHECK/OBSERVE activity classified as external after first-party, controlled-benchmark and public-demo exclusion.
2. **Qualified external** — external-to-external qualified reuse events and the external leases that consumed them.
3. **Voluntary local** — explicit `adoption-report --share` aggregate reports. These remain unverified and non-deduplicated.
4. **Public reach context** — daily public distribution observations such as registry/directory reachability, npm seven-day downloads, GitHub repository counters and an independently displayed MCPField install count when parseable.

The public-reach class is **context, not adoption**. npm downloads, directory listings, stars, forks, and displayed catalog installs do not establish unique users, companies, customers, geography, or retention.

### Confidence states

`NOT_YET_OBSERVED` means no admissible adoption signal has been seen.

`EMERGING` requires at least one direct external hosted lease, one voluntary report, or an independently displayed MCPField install signal.

`CONFIRMED` requires repeat, bidirectional, or qualified hosted activity plus corroboration from voluntary reports or an independently displayed catalog signal. npm downloads and GitHub counters remain reach context and cannot satisfy this gate by themselves.

`STRONG` requires multiple retained external leases, repeat activity, bidirectional CHECK/OBSERVE, qualified cross-client reuse, recent hosted activity, and at least two corroborating evidence classes.

These labels describe **strength of evidence**, not population size.

### Automated public-distribution collection

The existing daily Vercel maintenance Cron also runs the Adoption Atlas distribution refresh after retention housekeeping. The maintenance route remains protected by the same fail-closed `CRON_SECRET` authentication. Collection is off the CHECK/OBSERVE hot path and stores only daily aggregate/public metrics. A distribution-refresh failure is recorded as unavailable and does not undo or block retention housekeeping.

The collector currently checks:

- npm package downloads for the public last-week window;
- public GitHub repository stars/forks;
- MCPField SeenRelay listing and displayed install count when parseable;
- Official MCP Registry discovery;
- Glama discovery;
- Agent Plugins Directory;
- Anthropic Claude Community marketplace mirror.

Failures remain visible as failed distribution probes. They do not erase direct hosted evidence or fabricate adoption.


## Autonomous distribution snapshot

The daily GitHub Distribution Radar publishes a sanitized snapshot to the dedicated branch `automation/adoption-atlas-distribution`.

This branch is machine-maintained and is not merged into `main`. It contains only public reach/discovery metrics and probe status. It does not contain actor, client, IP, request, fact, prompt or customer identity.

Control Room prefers the freshest source between:

1. the Neon aggregate snapshot; and
2. the public automation snapshot.

When the automation snapshot is fresher, the runtime may backfill the aggregate Neon row. This removes Adoption Atlas dependence on the Vercel maintenance cron while retaining the cron as an additional collection path.

The snapshot remains **distribution context, not adoption**. Downloads, stars, forks and catalog install counters cannot establish unique users or companies.
