# Implementation Workflow

This is the base guidance for every write packet. Read the applicable workflow overlay as well.

## Framework boundaries

- Author framework behavior in TSRX only. Do not add TSX/JSX support or reactive behavior to plain `.ts` files.
- Do not hydrate. Component bodies run during initial render, not browser resume.
- Do not introduce a VDOM, render-output reconciliation, or a client component rerender path. Runtime graph data represents state/dataflow and DOM locator metadata.
- Initial render and browser resume are phases of one unified runtime/render model. Do not create a standalone server package or separate authoring model.
- Treat libraries as internal implementation boundaries until tests prove a public surface. Keep consumers on the main package and curated re-exports; do not publish or document deep APIs prematurely.
- Protocol and payload contract types live with the serializer package until tests prove a separate public package. Short repo-only test helpers live in package-local support or `scripts/test-utils`, not a standalone package.
- Keep shared compiler, runtime, serializer, and render/resume code runtime-agnostic ESM. Avoid `node:*`, `fs`, `path`, `process`, `Buffer`, and other Node-only assumptions.
- Put file access, module resolution, hashing, environment state, and dev-server integration behind host adapters. Prefer Web APIs, `pathe` for filesystem-like paths, and `ufo` for URLs, pathnames, and queries.
- Treat `poc/` as executable evidence and regression material, not the production framework. Do not extend its implementation unless the task explicitly owns POC maintenance.

## Contributor-facing code

- Prefer concrete, user-facing nouns that a junior contributor can understand locally, such as `imports`, `frameworkApi`, `payload`, and `locator`.
- Make compiler helper ownership and purpose visible in names. When context is still needed, add a short comment describing what the helper reads, why it exists, and what callers do with the result.
- Do not invent compiler jargon. Use a specialized term only when the owning specification and diagnostic already use it for users.

## Tests and verification

Everything is test-driven.

- For behavior changes and bug fixes, first add or update the closest focused test and run the narrowest command that fails for the expected reason. Then implement the smallest change, rerun the focused test, refactor, and broaden verification only for shared behavior.
- If a change is spec-only, formatting-only, generated metadata, or genuinely cannot be tested first, state why in the final report.
- Assert observable behavior or artifact contracts rather than incidental implementation details. Prefer focused artifacts and diagnostics to giant snapshots unless final emit is the behavior under test.
- Use Vitest browser mode for component and browser behavior, modeling the harness after the sibling `vitest-browser-qwik` repo adapted for this framework.
- Never hardcode benchmark, fixture, or test particulars in production code. Select behavior only from general TSRX structure and compiler artifacts, not fixture names, IDs, state names, classes, positions, helper names, or magic indexes.
- Prove hardcoding resistance with alternate-shaped fixtures that preserve the structural pattern while changing names, elements, properties, classes, and ordering. String blacklists are not adequate proof.
- Before finishing, scan the diff for hydration, VDOM, Node-only APIs in shared code, non-Rolldown/Vite build tooling, fixture hardcoding, and untested behavior changes.
