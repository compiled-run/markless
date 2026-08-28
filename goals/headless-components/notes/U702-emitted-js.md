# U702 — emitted `.js` symbol modules are now actually JavaScript

The landmine U699 left: an emitted symbol module is named `.js` and loaded as JavaScript, but its
text was copied out of authored TypeScript, so it spelled `WIDTH as Limit` and `const BASE: Limit =
WIDTH;`. This unit measured who reads that text, then stripped types at the one emission seam.

## Measurement first: is it a live defect?

**No — every consumer path already transpiles, so this was a fixture-readability and
honest-extension concern, not a browser SyntaxError.** The stripper that saves it lives in the
bundler, not downstream of it: `stripEmittedTypes` in `packages/bundler/src/transform.ts:83-113`
(oxc `transformSync` under a `markless-emitted.ts` filename), applied at emission time and
fail-closed.

| Path | Stripped before it runs? | Where |
| --- | --- | --- |
| Symbol modules → `virtual:markless:symbol:*` | yes | `bundler/src/transform.ts:515-535` |
| Source module, incl. the SSR body | yes | `bundler/src/transform.ts:575-580`, inputs at `:604-609` |
| Canonical render-data module (3 authored slices) | yes, per slice | `bundler/src/transform.ts:713,720,725-728` |
| Prod demand-load (rolldown chunk) | already stripped; rolldown adds no TS loader | `bundler/src/hooks/transform-emit.ts:264-271` |
| **Dev demand-load** (browser fetches `/@id/__x00__virtual:markless:symbol:…`) | **served raw — correctness rested solely on the bundler's emission strip** | `bundler/src/hooks/resolve-load.ts:120-131` |
| **Dev SSR** (vite module runner) | **served raw — same** | `bundler/src/vite/dev-prerender.ts:74-77` |
| Inline resumer `<script>` | yes, and fail-closed — but it is runtime-only `Function.prototype.toString`, never authored user text | `bundler/src/inline-resumer.ts:87-96,158-171` |
| SSR build prerender (`node import()`) | yes — a rolldown build of already-stripped modules | `bundler/src/build/prerender.ts:759-784` |
| `new Function` / `eval` / `node:vm` over emitted text | no such site exists | grep over `packages/{web,runtime,serializer,bundler,compiler}/src` |

The two raw-served rows are why "the bundler already handles it" was not a reason to leave it: a
single virtual id whose registration skipped the strip would have shipped TypeScript to a browser
with nothing left to catch it. Stripping at emission makes the `.js` honest at the source.

Which bands copied authored text verbatim, reproduced by compiling one file:
`event-handler` (`const n: number = …`), `state-initializer`, `shared-seed`
(`marklessProp_cap === undefined ? WIDTH as Limit : …`), `sync-computed-derive` (`… as number`),
`async-computed-runner` (`… as Limit`), and the SSR body (`const BASE: Limit = WIDTH;`).

## The fix: one line at the emission seam

Every symbol-module band already funnels through `printEmittedModule` in
`packages/compiler/src/passes/emit-codegen.ts` — the module that owns "how `packages/compiler` turns
an AST back into emitted source". The call sites are all in `symbol-modules.ts`
(`:1930, :2251, :2497, :2632, :3187, :3701, :4085, :4157, :5376, :7004`), so the fix is
`strip: false` → `strip: true` in `EMISSION_PRINT_OPTIONS`.

This is not a regex and not a second parser: `yuku-codegen@0.9.1` is already a direct dependency of
`packages/compiler`, and its `generate(program, { strip: true })` drops type annotations, `as`,
`satisfies`, non-null `!`, call/new/tagged-template type arguments, `import type` and inline `type`
specifiers, `declare`, interfaces and type aliases, `implements`, and `abstract`.

**A landmine in the neighbourhood:** `yuku-tsrx` also re-exports a `generate` that accepts a `strip`
option and **silently ignores it** — `generate(program, { strip: true })` from `yuku-tsrx` returns
the text unchanged. Only `yuku-codegen`'s own `generate` honours it. `emit-codegen.ts` already
imported the right one.

### The refusal path was already wired

`printEmittedModule` throws `EmissionDiagnosticError` whenever the printer reports errors, and the
message interpolates them. The printer reports exactly the constructs whose semantics stripping
would change, by name: `TypeScript enums cannot be stripped to JavaScript`, `TypeScript namespaces
…`, `parameter properties …`, `` `import = require()` … ``. So refusal came free, under
`MARKLESS_EMIT_CODEGEN_FAILED` — except namespaces, which are refused one step earlier by the
TSRX-node assertion (`TSModuleDeclaration` is already in `TSRX_ONLY_NODE_TYPES`) under
`MARKLESS_EMIT_TSRX_NODE_UNSUPPORTED`. Both name the construct; the pins record which code fires.

`declare` is erased without a refusal, correctly: it has no runtime form to lose.

## What this fix does NOT cover: the SSR module

The SSR module is not printed from an AST. `public-render` assembles it as text, so
`const BASE: Limit = WIDTH;` and `{ cap = WIDTH as Limit }` still survive in
`publicRenderModule.ssrModuleSource`. It is covered downstream by the bundler's whole-source-module
strip (`transform.ts:575-580`), so it is not a live defect either. Stripping it at emission would
mean either reprinting the whole hand-built module (reformatting every SSR fixture) or parsing each
spliced span separately (many places, and spans are embedded inside larger string templates where a
reprint's newlines would break the enclosing text). That is a second seam and a separate unit; this
unit's goal named "one place". `emitted-js.test.ts` pins the surviving TypeScript so a future strip
changes a pin deliberately rather than silently.

## A bundler caveat found while measuring (not fixed here — out of contract)

`stripEmittedTypesFromFragment` (`bundler/src/transform.ts:116-121`) skips reprinting when the
fragment already parses as JavaScript (`parsesAsJavaScript`, `:134-142`). A generic call is
TypeScript that *is* syntactically valid JavaScript with different meaning — `pick<Limit>(x)` parses
as `(pick < Limit) > (x)` — so it passes that gate and ships verbatim. This affects only the three
authored render-data slices (`:713/720/725`); symbol modules and the source module always take the
full reprint. The compiler-side strip now closes this shape for symbol modules, because the compiler
parses as TypeScript and prints stripped rather than sniffing. The render-data slices remain
exposed; that is a bundler-owned finding for whoever picks it up.

## Emit byte-equality

**No fixture moved.** `git diff --stat -- packages/compiler/test/__snapshots__` is empty and
`emit-byte-equality.test.ts` passes untouched. Stripping only elides TypeScript-only nodes; text
with no TypeScript syntax prints exactly as before, and every existing byte-equality fixture is
TypeScript-free in its symbol text. `emitted-js.test.ts` pins that directly with a full-module
`toBe` on a TypeScript-free handler.

The change is also byte-neutral through the bundler, as expected — the bundler was already
stripping. Receipt: `packages/bundler/test/fixture-builds.test.ts` reports
`emitted runtime gzip wall exceeded: 23588 > 23583` **identically with and without this change**
(measured by stashing `packages/compiler/{src,test}` and re-running). That failure is the standing
baseline noise U699 also recorded, not a regression from this unit.

## Pins re-anchored (12 assertions across 5 files)

These asserted the old ruling — that authored TypeScript survives into the emitted module — and now
assert the new one. Each is attributed:

- `emission-foundation.test.ts` — the `EMISSION_PRINT_OPTIONS` value pin, and the test formerly named
  `strip:false leaves TypeScript annotations in place, as splicing did`, inverted. Added: a
  byte-identity pin for TypeScript-free text, a refusal pin per construct (enum, namespace,
  parameter property, `import = require`) asserting both the diagnostic code and the named
  construct, and a pin that `declare` is erased without refusing.
- `emit-symbol-module.test.ts` (3) — three declaration-**order** tests whose class fixtures happened
  to use a parameter property (`constructor(public step: number) {}`). The parameter property was
  incidental to what they pin; they now write the assignment in the constructor body, so the
  temporal-dead-zone claim they exist for is unchanged. The refusal itself is pinned separately.
- `handler-callback-routing.test.ts` (2) — `(next: boolean)` → `(next)`. One test was named "reads a
  module carrying inlined TypeScript"; renamed to "an inlined setter body", which is its real
  subject.
- `multi-param-shared-method.test.ts` (3) — annotated parameter lists in `.module` assertions. The
  `.inlined` assertions in the same tests are unchanged: that artifact is pre-emission text and still
  carries the annotations.
- `type-only-imports/type-only-imports.test.ts` (2) — exactly the two U699 wrote to record the
  surviving annotation "so a future strip does not silently change what is being pinned". They now
  assert the annotation is gone.

## New pins

`packages/compiler/test/emitted-js/emitted-js.test.ts`, 13 tests. One authored file carries every
construct the goal names, spread so each band lifts at least one; each emitted module is parsed with
`parse(source, { lang: 'js' })` — a JavaScript-only parse, which rejects annotations, `as`,
`satisfies`, `!` and `import type` as diagnostics.

Bands pinned: `event-handler`, `state-initializer`, `shared-seed`, `sync-computed-derive`,
`async-computed-runner`, `behavior`, `dom-update`, `async-boundary-update`. Plus a sweep asserting
no emitted module of any kind carries a TypeScript-only spelling.

Two things the JavaScript-only parse cannot see, pinned by text instead:

- **A generic call.** `pick<Limit>(WIDTH)` parses clean as two comparisons, so it is pinned as
  `pick(WIDTH)` with `pick<Limit>` absent — the same shape as the bundler caveat above.
- **`export const authoredSource = "…"`.** Several bands export the authored expression as a string
  literal for re-derivation. Its *contents* are still TypeScript, and correctly so: it is data, not
  code, and it is re-parsed as TypeScript where it is read. The pins drop that line before reading
  code, and say why.

An enum is **not** reachable through a compile: an enum declaration is not carried into a symbol
module at all, so its name is left free rather than stripped, and no diagnostic fires. The enum
refusal is pinned directly against `printEmittedModule` in `emission-foundation.test.ts` instead.
A carried parameter property *is* reachable, and is pinned as a rejected compile.

## Suite state

`pnpm typecheck` clean. `pnpm exec vitest run --project node packages/compiler`: 239 files,
1891 passed, 1 expected fail, 0 failed. Whole node project: 465 files, 3604 passed, 1 expected fail,
37 skipped, and the one pre-existing bundler budget failure shown above to be identical without this
change.

`pnpm fmt` was not run — U699 recorded that it rewrites the whole repository regardless of the paths
handed to it. Note that `goals/` is gitignored in this repo, so this note lives on disk only and is
not part of the commit.
