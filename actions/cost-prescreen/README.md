# SeenRelay Cost Prescreen Action

Use this action to expose a **local-only, pre-evidentiary** SeenRelay cost scan in a GitHub Actions job.

It runs the published SeenRelay CLI and produces:
- the static prescreen status;
- candidate count;
- a non-mutating adoption plan;
- JSON report paths for later steps;
- a GitHub job summary visible to the team.

It does **not** contact the SeenRelay service, upload repository source to SeenRelay, enable reuse, suppress provider/tool calls, return a USE verdict, or grant an agent authority to change the project.

Example:

~~~yaml
name: SeenRelay cost prescreen
on:
  workflow_dispatch:
  pull_request:
permissions:
  contents: read
jobs:
  seenrelay:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - id: prescreen
        uses: ovladon/seenrelay/actions/cost-prescreen@main
      - run: |
          echo "status=${{ steps.prescreen.outputs.static_status }}"
          echo "decision=${{ steps.prescreen.outputs.decision }}"
~~~

A candidate should advance to normal-workload shadow measurement only after project/operator review. Keep stronger local/source/provider-native controls enabled.
