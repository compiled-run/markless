# Compiler Workflow

Read `implementation.md` first. This file is the compiler overlay.

- Treat `@tsrx/core` as an external dependency boundary. Never inspect, edit, run commands in, or depend on changes to `../native-tsrx`.
- If a required parser artifact is unavailable, keep Markless tests at the compiler artifact boundary, record the caveat, or ask before dependency work.
- Organize compiler behavior as pass-owned modules with typed, human-readable input and output artifacts. An orchestrator may validate and run the pass graph; an entry file may re-export; neither owns pass semantics.
- Before expanding compiler behavior, inspect the module layout, pass registry, and pass-level tests. If the behavior is concentrated in a large orchestrator, barrel, broad visitor, or shared mutable context, extract the owning pass boundary before adding semantics.
- Report a compiler change with its pass ID, artifacts consumed and produced, owning pass module, and focused artifact fixture or test. End-to-end output is supporting evidence, not a substitute for a pass-boundary test.
- For TSRX syntax, grammar, parser, or authoring semantics, check the TSRX MCP server with the appropriate documentation or compile tool and record what was checked. If it is unavailable, use `https://tsrx.dev/specification` and record that fallback.
