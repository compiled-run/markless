# Benchmark baselines and pinned pairs

`local/<lane>.json` is written by `--record` only after correctness gates pass. It is a schema-checked copy of the full result, including OS, architecture, CPU model, Node and pnpm versions, full Git SHA, dirty-tree flag, and the complete sample protocol. Absolute milliseconds are local observations, not a CI gate and not portable between machines.

Use `pairs/<lane>/<base-sha>--<candidate-sha>.json` for an improvement claim. Both names must be lowercase, full 40-character Git SHAs. A pair must assert that both worktrees were clean, that environment and protocol metadata are identical, and that the base and candidate SHA match the filename. It must retain both full raw result payloads, the calculated per-case deltas, and the declared noise threshold. A result counts as an improvement only when repeated measurements clear that threshold and every correctness gate remains green.

Memory values are allocator-growth observations across sustained renders without forced garbage collection. They must never be described as proof of a leak or absence of a leak.
