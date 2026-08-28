# U721 — the byte measurement that `methodCalls` owed, and the landing that followed

`TEMPLATE_READ_OPTIONS` in `packages/compiler/src/passes/semantic-graph/collect-elements.ts` was
`{ unaryOperators: true }`, with `methodCalls` deliberately off and a comment saying the widening
"is its own change with its own byte measurement". This is that measurement, and the numbers were
bounded, so the widening landed.

The defect it closes is U711's second one: `{box.items.join('|')}` as text and
`ui-joined={box.items.join('|')}` as an attribute minted no synthetic computed, so `payload-arena`
emitted no `domUpdates` record and the browser had nothing to subscribe. Both read once at render
and never moved again, while `{box.items.length}` and `ui-count={size}` on the same element
refreshed.

## The measurement

**Corpus.** Every `.tsrx` file in the repo — 1,056 files under `packages`, `demos`, `apps` and
`poc` — compiled through `compileTsrxModule` with no imported module interfaces, once with the flag
off and once with it on. Emitted size per file was the sum of the render-data module, the SSR
module, the symbol modules, the symbol resolver, and the JSON of `payloadScripts`, `protocolView`
and `protocolState`. Uncompressed; `payloadScripts` embeds the view and state JSON, so this total
counts those records about twice and is a ceiling, not a shipped-byte figure.

**Result, flag on and nothing else changed.** Four files moved, +13,234 B across a 32,178,258 B
corpus (0.041%):

| file | delta | new computeds |
| --- | --- | --- |
| `packages/typescript-plugin/test/fixtures/completion-matrix/construct-typing.tsrx` | +5,796 | 3 |
| `packages/vitest-browser/browser/taglist-form-value/shared-grow-family.tsrx` | +4,168 | 2 |
| `demos/chained-async-comparison/markless/app.tsrx` | +1,688 | 1 |
| `poc/nav-intent-prefetch/src/PageB.tsrx` | +1,582 | 1 |

**The one bound that had to be added.** With the flag on and nothing else, one compiler test went
red: `capture-slot-binding.test.ts` > `presentation-only opaque props do not demand a capture slot`.
Its page is `<p>{formatter.format(1)}</p>` where `formatter` is a prop. Lifting that call minted a
computed whose dependency is `prop:props.formatter`, which then demanded a capture slot for an
opaque receiver the payload cannot carry — a transport demand created out of a read that can never
change. The fix is the bound the attribute branch already took: `requireWritableRead: true` on the
text branch too, on the stated rule that no write can move a prop after the render that read it.

That single line removed `construct-typing.tsrx` from the moved list entirely — its calls were all
props-only. Final measurement, flag on plus the writable-read bound: **three files moved, +7,438 B
across the corpus (0.023%)**, and no file anywhere lost bytes, so the bound is a no-op on every
composite template read that existed before this change.

**Marginal cost of one newly reactive call**, measured on a controlled page (payload JSON plus
derive-module source, so no double counting): the second call costs **1,366 B raw (964 B payload,
402 B derive module) and 125 B gzip**; the third costs **1,346 B raw and 98 B gzip** — gzip falls
because the records repeat. Each lifted call buys exactly one computed record, one update record and
one derive module, and nothing else. Pinned with ceilings in
`packages/compiler/test/emit-byte-equality/template-method-call-bytes.test.ts`.

## The anchors

`pnpm exec vitest run --project node packages/compiler packages/bundler` was green before the change
(307 files, 2,420 passed, 1 expected fail) and is green after (309 files, 2,431 passed, 1 expected
fail; the two new files are mine).

**Emit byte equality: unchanged.** `packages/compiler/test/emit-byte-equality.test.ts` snapshots the
full emit of 15 fixtures. None of them spells a method call in a template position, so the snapshot
did not move by a byte and was not touched.

**Bundler staged budgets: unchanged, 0 B moved.** Both walls build `demos/music-player`, and that
demo contains no template method call at all — the reads there are bare cells and properties. Every
stage on both lanes held its anchor without any anchor being edited: the CSR lane's page-load
download, page-load execute and three marginal interaction stages, and the SSR lane's same five plus
its first-navigation stage. No file under `packages/bundler` was touched.

So the widening is attributable per fixture and pays only where the shape is written. It landed.

## What now needs unpinning, in files this unit does not own

The fix turns two `test.fails` rows green, which makes them report as failures until someone
removes the pin. Neither file is in this unit's contract.

- `packages/vitest-browser/browser/taglist-form-value/taglist-form-value.test.ts` —
  `an expression calling a method on the collection refreshes`, CSR and SSR. Measured after the
  change: 2 failed (these two, now passing under `test.fails`), 8 passed, 2 expected fail. The two
  still-expected failures are the row-mint pins, which this unit does not touch.
- `packages/headless/components/src/taglist/taglist.browser.ts` —
  `a consumer component's text over the family's value refreshes`, CSR and SSR. Measured after the
  change: 3 failed, 90 passed, 2 expected fail.

That third taglist failure is **not** this change. `CSR: the cap refuses the tag past it and says so`
(`expected '2 tags added' to be '3 tags is the limit'`) fails identically on the pilot tip with
`methodCalls` reverted — baseline noise for this unit, and someone else's to chase.

U711's first defect — a row whose attribute reads a cell outside the repeated item mints no markup —
is untouched here and remains open.

## Files

- `packages/compiler/src/passes/semantic-graph/collect-elements.ts` — `methodCalls: true`, plus
  `requireWritableRead: true` on the text branch, plus the comment that used to state the refusal.
- `packages/compiler/src/passes/semantic-graph/composite-reads.ts` — the two `CompositeReadOptions`
  doc comments, which both stated the old template-position policy.
- `packages/compiler/test/template-method-call-lift.test.ts` — new; the lift in text, attribute and
  conditional-class positions, arguments in the dependency set, the props-only bound, the refusals
  that stay (a bare call, a computed-member call, a call on a call result), and the unchanged shapes.
- `packages/compiler/test/emit-byte-equality/template-method-call-bytes.test.ts` — new; the byte
  ceilings above.
- `packages/compiler/test/template-unary-lift.test.ts` — the row asserting method calls stay
  un-lifted is now the row asserting a negated method call lifts through both gates; the file
  comment no longer restates the refusal.
- `packages/vitest-browser/browser/template-method-reads/` — new; `join`, `slice` and `toUpperCase`
  in both template positions over one state cell, CSR and SSR, refreshing after a write. All four
  rows fail on the unchanged tree with `expected 'alpha|beta' to be 'alpha|beta|gamma'`.
