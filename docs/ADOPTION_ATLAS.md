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
