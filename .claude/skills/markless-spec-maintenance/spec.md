# Specification Workflow

- Read `specs/framework-design.md` first, then only the relevant split specification under `specs/framework/`.
- The state ledger records implementation progress and caveats, not framework behavior. Access it only through the CLI described in the root guidance. Treat `specs/framework/archive/design-thread.md` as history, not the current contract.
- Preserve accepted decisions unless the task packet explicitly reopens them. Record intentionally unresolved topics as deferred rather than deciding them implicitly.
- Packets that touch preserved architecture must also read `implementation.md`; reference its framework rules instead of duplicating them here.
- Write behavioral contracts, not premature low-level storage shapes or exact compiler output. Prefer human-readable artifacts, pass boundaries, diagnostics, and fixtures.
- Make implementation-facing prose testable: state accepted behavior, unsupported cases, diagnostics, and validation strategy.
- For TSRX syntax, grammar, parser, or authoring semantics, check the TSRX MCP server with the appropriate documentation or compile tool and record what was checked. If it is unavailable, use `https://tsrx.dev/specification` and record that fallback.
- Run `git diff --check` before finishing.
