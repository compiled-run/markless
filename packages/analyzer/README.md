# `@markless/analyzer`

Portable contracts and invariant evaluation for Markless browser QA.

The package root is runtime-agnostic and accepts plain debug-channel snapshots,
request records, V8 coverage entries, and route/action matrix values. The
`@markless/analyzer/playwright` subpath provides page ledgers, channel probes,
candidate inventory, coverage measurement, crawl helpers, and generic fault
injection for Playwright consumers.

Applications retain their matrix data, network policy, budgets, pinned
baselines, report persistence, and test/gate wiring.
