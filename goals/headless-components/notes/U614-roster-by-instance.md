# The element-bound roster is keyed by widget instance, and the menu IDREF leak is closed

The roster entry a widget's seed phase files for an element() handle now carries
the instance token the reading side already computes to mint the id:

    markless:element-bound|<instance-token>|<handle-graph-node-id>

An enclosing widget's seed walk still descends through a nested family's root and
still files that family's handles - it cannot tell at build time which of them a
given nested instance will bind - but the entry it files now names the enclosing
instance. A nested instance inherits that entry and asks a different question, so
it reads "unbound" and its IDREF position writes no attribute.

## The three sites, one spelling

The key is built from one description so the two twins cannot drift:

- `elementBoundKeySource(token, handle)` in
  `packages/compiler/src/passes/public-render/residue-reader.ts` - prefix, token,
  `|`, handle.
- Served filing: `packages/compiler/src/passes/public-render/ssr-module.ts`, the
  `handleLines` in the seed case, taking the token from
  `widgetInstanceReadSource(...)` over `marklessSsrSeeds` - the same per-family
  read the mint uses (`markless:widget-instance|<definitionId>`, falling back to
  the plain key). It is emitted after this case registered its own instance, so a
  root files its own family's handles under its own token.
- Served and browser reads: `elementHandleIdReadCase` in the same
  `residue-reader.ts`, both the single and the list form.
- CSR filing: `marklessElementBoundKey` / `widgetInstanceTokenOf` in
  `packages/web/src/fns/element-handle-roster.ts`, reading the token out of the
  seed map `fns/shared-seed.ts` hands it - which already carries the plain and
  per-family instance keys by the time the roster is filed. `shared-seed.ts`
  needed no change.

One deliberate asymmetry: the omission read takes the token WITHOUT the mint's
`MARKLESS_ELEMENT_HANDLE_WIDGET_INSTANCE_MISSING` refusal. A part that resolved
no instance should omit the IDREF, which is what it did before; the mint, which
would otherwise write `id="undefined"`, still refuses loudly. Both filing sides
use the same non-throwing expression, so a page where nothing registers a token
files and reads under the same `undefined` and behaves exactly as before.

## Measured

`packages/vitest-browser/browser/idref-per-instance/nested-family.test.ts` - the
two rows U610 pinned as `test.fails` reported "Expect test to fail" on the first
run after the change, CSR and SSR both. The `.fails` is deleted; the rows are
plain `test` and green. `no-bar.test.ts` (the bisect) and
`idref-per-instance.test.ts` (the non-nested shape) stayed green throughout.

New witnesses:

- `packages/compiler/test/idref-per-instance/roster-key.test.ts` - compiles the
  Bar/Item/Content shape and pins that every filing, the served reader and the
  browser reader spell one identical key, counting occurrences so no fourth
  spelling can hide.
- `packages/web/test/roster-by-instance/roster-by-instance.test.ts` - the CSR
  filing on a hand-built surface: the enclosing widget files `contentEl` under
  its own token, a plain item inheriting that map reads unbound for `contentEl`
  and bound for its own `itemEl`, and the nesting item files under its own.
- `packages/compiler/test/emit-byte-equality/roster-key-bytes.test.ts` - see
  below.

## What the longer key costs

Measured by compiling three fixtures with the change and again with the three
source files stashed, same compiler otherwise (character counts):

| artifact | no shared handle | family, not nested | family, nested |
| --- | --- | --- | --- |
| `protocolState` / `protocolView` / `payloadScripts` | identical | identical | identical |
| `renderDataModuleSource` | identical | identical | identical |
| `componentDefinitions` (carries the browser residue readers) | identical | +410 | +410 |
| `ssrModuleSource` (server only, never shipped) | identical | +935 | +1448 |

So the packet's byte claim holds for the served payload and the render-data
module, on nested and non-nested pages alike, and the top-level
`emit-byte-equality.test.ts` snapshot (written before this change) passed
untouched. It does NOT hold for the compiled browser residue reader: a page that
reads a shared IDREF ships about 410 more bytes, because the reader now builds a
token-qualified key. Nesting makes no difference to that cost - the two pages'
readers are byte-identical to each other - and a page with no shared element()
handle emits no roster key at all. The new byte test pins those properties
(no roster key in any served payload, none in the render-data module, none
anywhere for a handle-free page, identical readers nested vs not).

## Which families the leak touched, and the two-handle idiom

The leak reached a family only where an IDREF names a handle of an INNER,
per-item widget family AND a page mixes items that place the part with items that
do not. From reading the four files U610 named (no guessless receipt; read this
as "these four, and possibly others"):

- **menu** - `aria-controls={item.itemContentEl}` (`menu.tsrx:530`) and
  `aria-labelledby={item.itemEl}` (`739`). The reported case, now closed.
- **accordion** - `aria-labelledby={item.labelEl}` on `accordion.itemcontent`
  (`accordion.tsrx:210`), plus `aria-controls={item.contentEl}` at `160`. Latent
  only; the shipped scenarios place the part on every item.
- **tree** - `aria-labelledby={item.labelEl}` (`tree.tsrx:246`). Latent.
- **tour** - `aria-labelledby={item.titleEl}` and
  `aria-describedby={item.descriptionEl}` (`tour.tsrx:196-197`), naming two
  OPTIONAL parts of `tourItemState`. This is the shape most exposed after menu: a
  step that writes no title still had the card naming one.

None of the four needs a two-handle `aria-labelledby` idiom for IDREF presence
any more - the singular per-item handle now answers correctly whether or not a
sibling item placed the part. Tree's plural `labelEls` on the outer family
(`tree.tsrx:27`, bound beside the singular at `277`) stays, but not for this
reason: the outer family walks that set for row/typeahead resolution
(`ownPart(labelEls, rowEls, row)` at `188`), which is a DOM-handle job, not an
IDREF one. Nothing here retires it.

## Menu lane: the pins are now stale, and that is the fix landing

`pnpm exec vp test --project ui packages/headless/components/src/menu`

- Base (this change stashed, everything else identical): **100 passed**. The
  pinned rows observed exactly `['aria-valid-attr-value']`, as U610 measured.
- With the change: **4 failed | 96 passed**. All four rows through
  `expectOnlyTheUnboundIdrefViolation` (`menu.browser.ts:135`) - CSR and SSR of
  "axe finds no violation on an open submenu" and of "axe finds no violation with
  all three levels open" - now observe `[]` where the pin expects
  `['aria-valid-attr-value']`.

That is the expected-fail passing: the dangling-IDREF violation the pin was
holding open is gone. The packet named two rows; the helper is used by four, and
all four flipped together. Flipping the pins means editing `menu.browser.ts`
under `packages/headless/**`, which this unit is forbidden to touch - it needs a
unit that owns that path. Until then the menu lane reads red for the right
reason.

## Other verification

- `pnpm typecheck` - clean.
- `pnpm exec vp test packages/compiler/test packages/web/test packages/serializer/test`
  - 307 files, 2344 passed, 1 expected fail.
- `pnpm exec vp lint --deny-warnings` - 0 warnings, 0 errors.
- `--project ui` accordion, tree, tour, tabs - all green.
- Browser lanes `idref-per-instance`, `root-idref`, `tour-gates`,
  `nested-widget-outer-write` - green.
- `packages/vitest-browser/browser/own-instance-handle` - **3 failed, base red**.
  Measured identical with this change stashed: the same three rows fail with
  `RuntimeResumeError: Element handle ...#pairLevelState/element:contentEl is
  registered by 2 rendered widgets on this page, and the reading handler named no
  instance`. That is a resume-time handler read through
  `packages/web/src/fns/element-handle.ts`, not the compiled IDREF path this unit
  changed, and it is failing on the merged tip already. Untouched here.
