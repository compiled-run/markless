# TypeScript 7.1 content mapper: can Markless move off the TS 5 plugin?

Date: 2026-10-20. Tested with `typescript@7.1.0-beta`, published to npm today, against Markless HEAD `dc272826`.
Status: research and prototype only. Nothing on `main` or `docs/markless-dev` was changed.

## Short answer

Yes for type checking, and it is fast: the CLI check runs 4 to 5 times faster. Editor support is good enough for most work, but the TypeScript 7 language server will not run Markless's own editor extras (custom completions, part inlay hints, auto-import repair). Two Markless compiler defects also have to be fixed first, because TypeScript 7 reports errors that TS 5 plus Volar silently drops.

Recommendation: go hybrid now. Use TS 7.1 for `tsc` checking. Keep the TS 5 plugin in the editor until 7.1 is stable and upstream fixes auto-import (#64119). Details are in "Recommendation" below.

## 1. How the content mapper works (sources)

- A tsconfig entry declares it: `"contentMappers": [{ "package": "...", "extensions": [".tsrx"], "options": {...} }]`. The package's `package.json` names the command to run: `"typescript": { "contentMapper": { "exec": ["node", "server.js"] } }`. See `schemas/tsconfig.schema.json` in the 7.1 beta package, and `internal/contentmapper/contentmapper.go` in microsoft/typescript-go.
- The mapper is a separate process. It speaks JSON-RPC over stdio, framed with `Content-Length` headers, protocol version 1. It has four methods: `initialize`, `openProject`, `transform` and `closeProject` (`internal/contentmapper/hostimpl.go`).
- `transform` returns:
  - the virtual text (`.ts` or `.tsx`)
  - span mappings as tuples `[virtualStart, virtualLength, originalStart, originalLength, kind, features?]`
  - diagnostics written by the mapper, in authored-source coordinates
  - optional "diagnostic directives", which ignore or expect TS errors in a virtual range
  - optional extra virtual outputs (`supplemental`)
- Span kinds are Verbatim, Atom and Alias (`internal/spanmap/spanmap.go`).
  - Verbatim means identical text. It is the only kind TypeScript will write text edits through (rename, code actions, auto-import).
  - Each span carries feature bits much like Volar's `CodeInformation`: hover, completion, definition, references, rename, code actions, inlay hints, semantic tokens, linked editing and more.
  - Diagnostics have no feature bit. In the source's words: "diagnostics on virtual text may not opt out of reporting".
- Running a mapper is opt-in: `tsc --runExternalCode` on the command line, and `initializationOptions.runExternalCode` in `tsc --lsp`. In VS Code this is the `js/ts.contentMappers.enabled` setting plus workspace trust.
- Mapped files emit declarations only, never JavaScript. That does not matter for Markless, which uses `noEmit` and its own bundler.
- Stability: andrewbranch says "the content mapper protocol will only change in backward-compatible ways during 7.x" ([microsoft/TypeScript#64709](https://github.com/microsoft/TypeScript/issues/64709)).
- Timeline: [7.1 beta announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-1-beta/), and the [iteration plan #63703](https://github.com/microsoft/TypeScript/issues/63703) (RC 2026-11-10, stable 2026-11-24). The beta shipped two weeks late, so the later dates may slip too.

What the TypeScript team declined, quoted from [typescript-go#4712](https://github.com/microsoft/typescript-go/pull/4712) and [#63800](https://github.com/microsoft/TypeScript/issues/63800):
- On replacing custom language servers: "not intended to replace fully custom language servers... ecosystems implementing complex transforms may still want to implement their own language servers alongside TypeScript's."
- On filtering errors: "It's not currently possible to filter diagnostics by code. This is a break from Volar."
- On CLI checks: there is no way to "do semantic checks over a full program and issue custom diagnostics in the CLI".
- Only one mapper may handle each extension, and mappers do not take part in module resolution ([#64546](https://github.com/microsoft/TypeScript/issues/64546), closed as "Working as Intended").
- Rename through non-identical text is out of scope for 7.1: "falls into the category of things that a custom extension should provide on top of content mappers" ([#63879](https://github.com/microsoft/TypeScript/issues/63879)).
- The one way to change results the way a plugin did is VS Code-only, on the client side: `registerLspMiddleware(method, (result, ctx) => result)` in the TypeScript 7 extension API (`typescript/vscode`, [PR #64583](https://github.com/microsoft/TypeScript/pull/64583)). It covers completion, hover, inlayHint, codeAction, definition, rename and about 16 other methods. It does nothing for Neovim, Zed or the CLI.

TSRX's experience is tracked in [tsrx-org/tsrx#136](https://github.com/tsrx-org/tsrx/issues/136), with details in `packages/content-mapper/COMPATIBILITY.md`, `BENCHMARKS.md` and `ROLLOUT.md`.
- They ship `@tsrx/content-mapper` 0.1.2 and keep the TS 5.9/6 plugin with no plan to deprecate it.
- Their remaining TS 7 gaps are filed upstream, mostly by leonidaz. Status on the 7.1 beta:
  - Fixed: JSX auto-close (#64564), and the `.d.tsrx.ts` naming (#64053), which is now configurable through `outputExtensions`.
  - Still open: auto-import that adds a new import (#64119, milestone 7.1.1 RC), rename through non-identical text (#63879, excluded from 7.1), Find File References (#63806, backlog), Go to Source Definition in the extension (#64576), a `tsserverRequest` equivalent (#64580), the formatter opt-out (#64579), and push diagnostics (#63921, an open PR).
- They will make TS 7 their default only when 7.x is stable, #64119 and #63879 are fixed or accepted as permanent, and push diagnostics land.
- Their mapper reads `tsrx.compiler` from the tsconfig. Markless's tsconfigs already set it to `@markless/typescript-plugin/volar`, so `@tsrx/content-mapper` runs the Markless compiler with no Markless code at all. Verified below.

## 2. What @markless/typescript-plugin does today, and the TS 7.1 equivalent

The plugin wraps the upstream `@tsrx/typescript-plugin`, which provides the Volar layer. On top of that it adds the files in `packages/typescript-plugin/src/`. The test IDs below are from `test/completion-matrix.test.ts`. "Verified" means I checked it against `tsc --lsp` 7.1 beta with the prototype mapper.

| Capability | TS 5 plugin today | TS 7.1 content mapper | Evidence |
|---|---|---|---|
| `.tsrx` type checking on the CLI | `markless-tsc` (`tsc.ts`), using Volar `runTsc` | Native: `tsc --runExternalCode` | Verified. Same diagnostics at the same authored line and column for wrong, missing and unknown props, member errors and errors inside `@if` arms |
| Imports between `.ts` and `.tsrx` files | `resolution.ts` hooks `resolveModuleNameLiterals` | Native when the specifier names `.tsrx` explicitly. Extensionless imports are refused (#64546) | Verified hover and definition from a `.ts` file. Markless code and starters use explicit `.tsrx` (718 explicit relative imports on the website; the only extensionless ones point at `.ts` files) |
| JSX contract (`markless-tsrx.d.ts`), M10 | `getExternalFiles` | Not needed: the generated `@jsxImportSource @markless/typescript-plugin` resolves the contract through package exports | Verified: removing it from `include` changes nothing |
| Parse-error diagnostic (TS91001) | `getSyntacticDiagnostics` decorator | Mapper `diagnostics`. They print as `error markless91001` instead of `error TS91001` | Verified, CLI and LSP |
| Hover and go-to-definition on tags and imports (M1, M5, M11) | Volar | Native | Verified |
| Member completion through `state()`/`computed()` (M2, M3) | Volar | Native | Verified |
| Prop completion in an opening tag (M9) | Volar plus filtering in `completions.ts` | Native list (`name`, `size?`, `alt?`). The "only inside opening tags" filtering is not tested | Partly verified |
| Tag-name completion (M4d) | Custom catalog in `completions.ts` | Native JSX completion offers intrinsic tags and in-scope components (`div`, `Mascot`), but without Markless's own ordering, kinds and filtering | Verified |
| `@` construct snippets (M4: `@if`, `@for-of`, ...) | Custom `getCompletionsAtPosition` | **Not possible** in the server. Needs a second language server, or VS Code middleware | Verified: 0 items |
| Route `href` completion (M15) | `@markless/router/typescript-plugin` | `href` values and the `/` route list come natively from the route types (77 routes). Route completion in arbitrary strings is lost | Verified for `href` |
| Part inlay hints (M17) | Custom `provideInlayHints` | **Not possible** in the server. VS Code middleware could add them, but it needs checker access through the API pipe | Verified: only TS's own hints appear |
| Auto-import into `.tsrx` (M14, both cases) | `getCompletionEntryDetails` repair in `index.ts` | **Broken upstream** (#64119): the auto-import entries are left out of the list entirely, even when an import from the same module already exists. They work in `.ts` | Verified: `computed` is missing in `.tsrx` and offered with an import edit in `.ts` |
| JSX closing tag (M12) | `getJsxClosingTagAtPosition` remap | Fixed in the 7.1 extension (#64564). Linked editing works | Linked editing verified; auto-close is extension-side and was not tested |
| Rename | Volar | Works for Verbatim spans, including a destructured prop (it produced `open: shown`). Fails through Atom spans (#63879) | Verified |
| References, signature help, document highlights | Volar | Native | References and signature help verified |
| Half-typed file keeps its types | `compileEditorSource` recovery ladder in `volar.ts` | Partly. With recovery, the hover on `constructs.tsrx` works. But scaffolding errors from recovery ("Cannot invoke an object which is possibly 'null'", TS2721) now appear, because TS 7 cannot drop errors. The mapper must cover them with `ignore` diagnostic directives | Verified |
| Completion right after a fresh dot (M6) | Recovery plus `completions.ts` | **Fails in the prototype**: the loose compile throws, the file falls back to a stub, and 0 completions come back. Fix: emit `profile.` to TS as written (TS parses a dangling dot itself) or keep the last good output | Verified failure |
| Plugin configuration (`configurePlugin`, part-hint switch) | tsserver plugin config | Mapper `options` only (static per project). No live switch | From the protocol |

## 3. Prototype

Where it lives:
- Branch `research/ts7-content-mapper`, worktree `/private/tmp/markless-ts7`. It is uncommitted, because the pre-commit hook runs the full CI fast job and the prototype uses absolute scratch paths.
- `research/ts7-content-mapper/server.mjs` is the Markless mapper. It is about 70 lines and calls `compileToVolarMappingsWithoutRecovery` (CLI) or `compileToVolarMappings` (editor, with `options.recover`) from `packages/typescript-plugin/src/volar.ts`. It borrows the RPC transport and the Volar-to-span-map converter from `@tsrx/content-mapper` 0.1.2 (MIT).
- `repair.mjs` is a stopgap that patches the two compiler defects below without changing any text offsets.
- `lsp-probe.mjs` drives `tsc --lsp --stdio`.
- `tsserver-timing.ts` times the TS 5 tsserver with the plugin.
- `website/tsconfig.json` and the root `tsconfig.json` on that branch gained a `contentMappers` entry. TS 5 ignores that key, so one tsconfig serves both stacks.

### Finding: TS 5 plus Volar hides real errors that TS 7 reports

Volar drops any diagnostic that starts on a character not mapped with `verification`. TS 7 cannot drop errors. Running the 7.1 check over markless.dev surfaced:

1. **Syntax-invalid generated TSX.** Fifteen syntax errors (TS2657 "JSX expressions must have one parent element", TS1136, TS1128) across 8 files. They include `packages/headless/components/src/slider/slider.tsrx` and `table/table.tsrx`. Under TS 7, a syntax error anywhere skips semantic checking for the whole program, so this blocks everything else. Two causes, both in `packages/compiler/src/type-service.ts`:
   - `emitTsrxCodeBlock` (line 197) emits `return ${render};`. When the component's render is a top-level `@if`, the render is a deferred construct `{(() => ...)()}`, so the output is `return {(() => ...)()};`, which is invalid. It should be `return <>${render}</>;`.
   - JSX elements inside `@if`/`@for` arms that reach `emitPlainStatement` as plain statements come out one per line with no `;` between them, so TypeScript reads the next `<` as a sibling. On the website this is 71 places in 6 files.
2. **Seven `Type 'unknown' is not assignable to type 'Child'` errors**: `{children}` where `children?: unknown`, in `document.tsrx`, `components/docs/code.tsrx`, `code-files.tsrx`, `ui/preview.tsrx` and `sketch/*`. TS 5 reports them on the raw generated code too. Volar drops them because the error starts on the unmapped `{`. Either the types or the contract needs fixing.

With both repairs, the root `tsconfig.json` (the repo `typecheck` gate) is clean on TS 7. markless.dev is clean apart from the 7 errors above.

The zero-code path works too. Pointing `contentMappers` at the published `@tsrx/content-mapper` (which follows `tsrx.compiler` to `@markless/typescript-plugin/volar`) type-checks Markless files through the Markless compiler. It hits the same 15 syntax errors, and it always uses the editor recovery path, which a CI checker should not.

### Speed (Apple Silicon, `~/.claude/bin/heavy`, same worktree, warm cache, median of 3)

| Measurement | TS 5.9.3 + `markless-tsc` / tsserver plugin | TS 7.1.0-beta + prototype mapper |
|---|---|---|
| markless.dev check (`website/tsconfig.json`, 215 `.tsrx`) | 6.3 s wall, 10.8 s CPU, 2.1 GB peak | 1.3 s wall, 3.7 s CPU, 0.68 GB peak |
| Repo `typecheck` (root tsconfig, 559 `.tsrx`) | 6.7 s wall, 1.36 GB peak | 1.6 s wall, 0.80 GB peak |
| Editor: open file to first diagnostics (website project) | 2.17 s | 0.81 s |
| Editor: edit to diagnostics | 37 to 98 ms | 19 to 28 ms |
| Hover | 6 ms | about 1 ms |

The mapper is now the slowest part.
- On the website it spent 0.49 s in Markless compiles. The repair pass adds 0.1 s, because it uses the TS 5 parser and goes away once the compiler is fixed.
- That was inside a 0.63 s process lifetime, out of 1.3 s total. TypeScript runs one mapper process per mapper identity, so compiles run one at a time.
- TSRX sees the same floor of about 600 ms (BENCHMARKS.md). The cost is Node start-up plus loading the compiler.

Not tested: the VS Code UI itself (the LSP was driven directly), `--watch`/`--build`, and Linux or Windows.

## 4. What is missing ("refused"), and the workarounds

| Gap | Owner | Workaround | Cost |
|---|---|---|---|
| `@` construct snippets, the Markless tag catalog, route completion in arbitrary strings, part inlay hints | Refused by design: no server-side result decoration | (a) VS Code `registerLspMiddleware` on `textDocument/completion` and `textDocument/inlayHint`. Part hints need types, which means an API connection (`initializeAPIConnection`, `typescript/sync`). (b) A small Markless or TSRX language server beside `tsc --lsp`, the route TSRX's own server takes for snippets and CSS | (a) 1 to 2 weeks plus owning a VS Code extension. Markless dropped its own extension and relies on the upstream TSRX one. (b) 2 to 4 weeks, but it covers every editor |
| Auto-import into `.tsrx` (M14) | Upstream #64119, milestone 7.1.1 RC | None in the server. Middleware could re-add items but cannot compute the import edit without the API | Wait for the fix |
| Rename through non-identical text | Refused for 7.1 (#63879) | Keep Verbatim spans wherever possible. The prototype's rename cases worked | Low, and it is mostly already true |
| Scaffolding errors cannot be filtered | Refused (no filter by code) | Mapper `diagnosticDirectives` (`ignore`) over synthesized ranges, and type-service output that is clean by construction | 2 to 4 days in the compiler or mapper |
| Extensionless `.tsrx` imports | Refused (#64546) | Already the Markless convention | None |
| Find File References, Go to Source Definition, `tsserverRequest` | Upstream backlog | None | Wait |
| Other editors get no TS diagnostics without pull diagnostics | Upstream PR #63921 | Neovim 0.10+ pulls | Wait |
| tsgo offers itself as a `.tsrx` formatter that returns nothing | Upstream #64579 | Set `editor.defaultFormatter` | Docs |

## Recommendation

**Hybrid now: TS 7.1 for checking, TS 5 plugin in the editor.** Then move the editor to 7.1 when (1) 7.1 is stable, (2) #64119 auto-import ships, and (3) Markless decides how to deliver its custom completions and part hints.

Why:
- The CLI gain is large and real: 4 to 5 times faster with about half the memory.
- The checking is equivalent: same diagnostics at the same authored positions.
- The protocol is promised to stay backward compatible through 7.x.
- The editor would lose features users rely on every day: `@` construct snippets, part hints and auto-import. It would also lose the half-typed-file behaviour until the mapper gains last-good fallback and ignore directives.

Staying on 5 is wrong, because the type-service defects TS 7 exposed are real and should be fixed either way. A full move today is wrong too, because 7.1 is a beta from today and auto-import is broken upstream.

What the hybrid needs:
1. Fix the two type-service defects in `packages/compiler/src/type-service.ts`. These are worth fixing even on TS 5.
2. Fix or accept the 7 hidden `unknown`-children errors.
3. Add a `@markless/typescript-plugin/content-mapper` entry (the prototype `server.mjs`, without the repair pass and with no absolute paths). It uses the no-recovery compile for the CLI, recovery plus ignore directives for the editor, and authored Markless diagnostics.
4. Have `markless-tsc` choose TS 7 `tsc --runExternalCode` when TS 7 is installed, as `tsrx-tsc` does. Keep the TS 5 path.
5. Add `contentMappers` to the scaffold tsconfigs in `packages/cli/templates/starters/*`. TS 5 ignores it.

Open question for the owner: write Markless's own mapper, or use `@tsrx/content-mapper` through `tsrx.compiler`? Upstream's needs no code, but it runs the editor recovery in CI and gives Markless no control over diagnostics. Recommendation: Markless's own mapper, because it is about 70 lines and keeps the CLI strict.

## Smallest next experiment

Fix the `return ${render}` and sibling-statement emission in `type-service.ts` on a branch. Then run, with no repair pass:

```
tsc -p tsconfig.json --runExternalCode --noEmit
```

using `typescript@7.1.0-beta` and the prototype mapper, over the root tsconfig and `website/`. Success means 0 syntax errors, and the same diagnostics as `pnpm run typecheck` apart from the 7 newly visible `unknown`-children errors. That is a one-day check, and it shows whether CI can run its type gate on TS 7.
