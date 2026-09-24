# Internal export minification: rejected option change

Workflow guidance: .ruler/skills/markless-implementation/implementation.md, .ruler/skills/markless-implementation/bundler.md, .ruler/skills/markless-implementation/performance.md.

Native packing currently sets `minifyInternalExports:false`, unlike the ordinary chunk planner. A one-option experiment enabled Rolldown's export minification. Two alternate actual-build fixtures demonstrated lazy module side effects, repeated namespace identity and shared live bindings in both configurations; their short-export assertion failed before the change and passed afterward. The temporary test is retained as `export-minification-test.ts.txt`, outside the test suite.

The real docs build rejected the change. Its generated symbol tables retain original export-name strings, while the target packed exports are renamed. The table-route verifier reported missing symbol exports/re-export chains. This is a failed consuming-application check, not permission to remove the check. Supporting minification would require preserving or rewriting those table mappings and validating the resulting dispatch; that redesign is outside this experiment. No valid docs output or timing comparison exists for the candidate.

The option is restored to false and the temporary production test removed. Root `pnpm run typecheck`, docs typecheck, 64 docs tests and 29 final focused native/facade/symbol-table tests pass. The candidate's broad bundler run has 623 passing tests and the same six existing size/negative-budget failures. No ceilings changed. The restored docs doctor/build passes and its 63 client JavaScript files match the previously verified final build byte-for-byte, including filenames and hashes: 19,292,124 bytes total.

Direct Chrome clicks on the unchanged verified preview at `http://localhost:3019/markless/concepts/state` reach counter 2 and independent counter 1, without starting full resume. Five framework scripts plus three site scripts return 200, no service worker controls the page, and no console errors or warnings appear. This manual check is separate from the cold timing runs in [INTENT-EXECUTION.md](./INTENT-EXECUTION.md).

[EXPORT-MINIFICATION.json](./EXPORT-MINIFICATION.json) records the restored output inventory and logs. No production change from either experiment is retained, and no commit, push or goal closure occurred. Complex-control startup and the six size gates remain unresolved.
