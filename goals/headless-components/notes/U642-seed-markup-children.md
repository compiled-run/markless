# Seeds and markup children, and the third printer of a folded constant

Two halves. The storage-seed printer landed. The markup-children half did not:
it is measurable, it is buildable, and the build needs three test files this
packet did not give me. The refusal pin stays where it is.

## Half 1 — can a seed carry markup children's text content?

### What the chunk actually holds

Measured by compiling the meter family from
`packages/compiler/test/seed-children/seed-reads-projected-text.test.ts` with
different children between `<MeterLabel>` and `</MeterLabel>`, and reading the
projection chunk (`projection:component-edge:2`) off `result.renderData`:

| children written | statics | hosts | slots |
| --- | --- | --- | --- |
| `50 of 100 rows` | `["50 of 100 rows"]` | 0 | 0 |
| `<em>50</em> of 100 rows` | `["<em>50</em> of 100 rows"]` | 1 | 0 |
| `<em>{50}</em> of 100 rows` | `["<em><!--markless-slot:0-->", "</em> of 100 rows"]` | 1 | 1 |
| `<em title="a>b">50</em> rows` | `["<em title=\"a&gt;b\">50</em> rows"]` | 1 | 0 |
| `<strong><em>50</em></strong>&nbsp;of 100` | `["<strong><em>50</em></strong>&amp;nbsp;of 100"]` | 2 | 0 |

The line that separates "knowable at compile time" from "has no value until it
renders" is **`slots.length === 0`**, not `hosts.length === 0`. A host entry is
an element the projection renders; it carries no value of its own. `staticProjectionChildren`
today refuses on `hosts.length > 0 || slots.length > 0`, so it is refusing on the
wrong half of that pair — a markup projection with no expression in it is
already spelled completely in `statics`.

Tag boundaries are unambiguous over compiler-emitted HTML: `>` inside an
attribute value comes out as `&gt;` (row 4), so `<[^>]*>` never cuts in the wrong
place. Stripping tags from `<em>50</em> of 100 rows` gives `50 of 100 rows`,
which is what the label renders and what a reader hears.

So on feasibility: **yes, the seed can carry the text content.** "Refuse stays"
is not the right answer for the reason the refusal states.

### The thing that makes it not a one-line change

The statics are HTML, so authored text reaches them **escaped**. Row 5 above:
authored `&nbsp;` (seven literal characters) becomes `&amp;nbsp;`.

That is not only a markup-path problem. It is already wrong on the static-text
path U566 shipped. Measured, with no markup anywhere in the projection:

```
<MeterLabel>Tom & Jerry rows</MeterLabel>
  chunk statics : ["Tom &amp; Jerry rows"]   (hosts 0, slots 0)
  emitted seed  : children:"Tom &amp; Jerry rows"
  label renders : Tom & Jerry rows
```

The sibling that reads the seeded cell holds `Tom &amp; Jerry rows`; the label
beside it shows `Tom & Jerry rows`. `staticProjectionChildren` returns
`statics.join('')` with no decode step, on both the compiler side
(`public-render/shared-seed-pass.ts`) and the CSR twin
(`packages/web/src/prerender/children-projection.ts`).

This is why the markup half is a design fork rather than an added branch:

- Strip tags and do **not** decode entities: the seed gets `50 &amp; 100 rows`
  where the reader hears `50 & 100 rows`. Wrong, and newly wrong.
- Strip tags **and** decode: correct for markup — but then the two branches of
  one prop disagree, because the static-text branch still hands over escaped
  bytes. Making them agree means decoding on the static-text branch too, and
  that moves the emitted bytes of modules that compile today (any projected
  static text containing `&`, `<`, `>` or `"` into a seeding part). The packet's
  own condition is "bytes unchanged for modules without markup children in a
  seed position", and this would break it — for a good reason, but it is a
  ruling, not an improvisation.

There is a second, smaller fidelity gap worth naming before anyone builds this.
Text content is not the accessible name: a `<style>` or `<script>` element in the
projection, an `aria-hidden` subtree, or `<img alt="...">` all make the stripped
string differ from what a reader computes. For the shapes a label part actually
carries this is fine; it is not a general "the seed now holds what the reader
hears" guarantee, and the refusal message should not claim one.

### Why I did not land it

The refusal is pinned in four places. One is in this packet's file contract;
three are not, and all three run under this packet's own Verification block
(`pnpm exec vp test packages/compiler/test packages/web/test`):

- `packages/compiler/test/seed-children/seed-reads-projected-text.test.ts` —
  row *"a markup projection is refused at compile time rather than seeding
  undefined"*. **Outside the contract.**
- `packages/compiler/test/seed-children/imported-seed-children.test.ts` —
  row *"a markup projection into an imported seeding part is refused"*.
  **Outside the contract.**
- `packages/web/test/seed-children-projection.test.ts` — row *"a projection
  carrying an element answers with nothing"*, which pins the CSR twin directly.
  **Outside the contract.**
- `packages/vitest-browser/browser/seed-projected-children/seed-projected-children.test.ts`
  — the refusal row. Inside the contract.

`packages/headless/components/src/progress/note.md` also states the refusal in
prose; that directory is forbidden to this packet and nothing runs it.

Landing the emitter change without those three files turns the verify block red.
So: measurement recorded, pin left standing, half returned blocked.

### What I did leave behind

`packages/compiler/test/seed-markup-children/seed-markup-children.test.ts`,
5 rows, green on this tip. They pin the measurement rather than the future
behaviour, so a re-cut unit starts from facts instead of re-deriving them:

1. markup with no expression is fully spelled in the chunk (`slots` empty,
   `hosts` names the `em`, statics join to the exact HTML);
2. an expression inside the markup leaves a slot to render;
3. a `>` inside an attribute value is escaped, so tag boundaries are unambiguous;
4. **the escaping witness** — the static-text seed carries `Tom &amp; Jerry rows`
   while the label shows `Tom & Jerry rows`;
5. markup children stay refused.

Row 4 is the one that should decide the re-cut. It is a live wrongness on the
shipped path, independent of markup, and it is arguably the unit that should run
first.

### What a re-cut needs

File contract additions: the three test files above. Plus a ruling on the
escaping fork — my recommendation is to decode entities on **both** branches and
accept the byte move, because two branches of one prop meaning different things
is a worse landmine than a one-time byte change, and the escaped form is wrong
today whichever branch you are on. `emit-byte-equality` would need its
expectations moved for exactly the modules that carry `&`/`<`/`>`/`"` in
projected static text into a seeding part.

## Half 2 — the third printer of a folded constant

### Landed

`packages/compiler/src/passes/public-render/non-finite-json.ts` — one exported
function, `jsonSourceWithNonFiniteNumbers(value)`, which is the printer U653 put
inline in `module.ts`, lifted out unchanged and given `JSON.stringify`'s own
signature (`string | undefined`). It walks the payload with a replacer; with no
non-finite number in it, it returns that JSON byte for byte. Only when one is
present does it take a second pass, swapping each for a marker string and then
replacing each marker with `nonFiniteName(value)` imported from
`@markless/serializer` — the protocol's own name, never restated. The marker
grows an underscore if the payload happens to spell it.

Two call sites now:

- `public-render/module.ts` — `marklessRenderData`, unchanged behaviour, the
  local copy deleted.
- `public-render/render-body.ts:291` — the storage-seed default, which was
  `binding.storage ? JSON.stringify(binding.initialValue) : undefined`.

### The gap U657 named is NOT live, and here is why

U657 called `render-body.ts:291` "a live gap today ... for a `1e400` literal seed
on a storage cell". Measured: it is not.

`storage()` accepts a **string literal** fallback and nothing else.
`packages/compiler/src/passes/semantic-graph/collect-storage.ts` reads both
arguments through a local `stringLiteral()` helper and pushes
`MARKLESS_STORAGE_KEY_STATIC` ("Storage fallback must be static") when the
fallback is not one. Measured across `'light'`, `5`, `1e400`, `-1e400`, `+'x'`,
`Infinity` and an object literal: only the string produced a binding at all; the
other six produced zero bindings and that diagnostic. So a storage binding's
`initialValue` is a `string` by construction, and `JSON.stringify` of a string
never yields `null`.

The arm *is* reachable — that part of U657 holds. Measured by throwing inside it
and running `packages/compiler/test` plus `packages/web/test`: exactly one row
reaches it, `storage.test.ts > "render body lowering treats storage metadata as a
state initializer"`, with `initialValue` `"light"`. Reachable, but only ever with
a string in hand.

So this half is a correctness prerequisite, not a bug fix: it is byte-neutral
today and stops being a silent `null` the moment anything widens what a storage
seed may hold.

`packages/compiler/test/storage-seed-printer/storage-seed-printer.test.ts`,
5 rows:

1. a finite storage seed prints the bytes JSON already printed (string, object);
2. a non-finite one prints `nonFiniteName`'s name rather than `null` — **fails on
   the parent** (verified by reverting the one call site: 1 failed, 4 passed);
3. the printer returns JSON byte for byte for a finite payload with quotes,
   newlines, backslashes, `-0`, `1e308`, nested arrays, and `undefined` in
   returns `undefined`;
4. a payload spelling the marker keeps it as authored text;
5. the upstream refusal that keeps a number away from this printer, pinned — so
   a future widening of `collect-storage.ts` trips a test here instead of
   printing `null` quietly.

The rows drive `renderBodyLines` with a hand-built declaration, the way
`storage.test.ts`'s existing row does, because the front end cannot currently
produce a non-finite storage fallback to drive it end to end.

### Can `collect-state.ts`'s fold refusal be lifted now? (not lifted here)

Closer, but still no — and the remaining blocker is not this printer.

U657 listed three printers of a folded constant and said all three had to be
taught the serializer's names before the `foldedConstant` refusal at
`collect-state.ts:1474` could go. All three are now done: the render-data module
(U653), the bundler's definitions (U657), and this one. **That part of the
condition is discharged.**

What is still open is what U657 flagged as the second reason, and I did not
close it:

- `payload-arena.ts:505` feeds `pathInitialValue` into a `BehaviorInputValue`.
  U657 did not follow that to its printer and neither did I. It stays the one
  unaudited consumer.
- Lifting flips routing, not just printing. A seed that folds completely carries
  no `initializerSource` and sets `initialValueKnown`, so the cell leaves the
  carry path in `protocol-state`, `symbol-resolver` and `state-lowering`.
  `packages/headless/components/src/crop` seeds both size caps
  `Number.POSITIVE_INFINITY`, so crop is the live consumer that would flip from
  carry to fold. That is a behaviour change to measure on the crop lane, not a
  one-liner.

Recommendation: the lift is now a two-step unit — audit the `payload-arena`
consumer to its printer first, then lift and re-run `seed-fold-per-property`,
`seed-module-const`, `packages/web/test/carried-seed-property`,
`emit-byte-equality` and `vp test --project ui packages/headless/components/src/crop`.
`collect-state.ts` was forbidden to this packet, so nothing there moved.

No completeness receipt is claimed over every reader of `binding.initialValue`.
What I checked is named above; U657's eight-site grep list stands unchanged.

## Measured

Every command in the packet's verify block, in this worktree:

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project browser packages/vitest-browser/browser/seed-projected-children packages/vitest-browser/browser/seeded-write packages/vitest-browser/browser/nonbubbling-dispatch`
  — 3 files, 14 passed. (The markup refusal prints a compile error into the log;
  that is the pinned row asserting the import rejects.)
- `pnpm exec vp test packages/compiler/test packages/web/test` — 321 files,
  2427 passed, 1 expected fail.
- `pnpm docs:errors:check` — 200 codes, in sync. No diagnostic changed, so no
  catalogue regeneration was needed.
- `pnpm exec vp test --project ui packages/headless/components/src/progress packages/headless/components/src/tour`
  — 61 passed, 1 expected fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors. (First run raised 8
  `no-loss-of-precision` warnings on `1e400` written as a JavaScript literal in
  the new test; the rows hand the printer a value directly, so
  `Number.POSITIVE_INFINITY` / `NEGATIVE_INFINITY` / `NaN` say the same thing
  without the lossy literal. `1e400` survives only inside the `.tsrx` source
  string, where it is text.)
