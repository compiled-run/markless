# The seed carries what the reader hears

The seed a part reads from its projected `children` now carries the projection's
**text content** — tags dropped, entities decoded — on both render paths, and a
projection carrying markup with no expression in it is no longer refused.

Two things changed behind one function, `staticProjectionChildren`:

- its gate went from `hosts.length > 0 || slots.length > 0` to `slots.length > 0`;
- its answer went from `statics.join('')` to `projectionTextContent(statics)`.

Everything else follows: the compiler's SSR emit and the
`MARKLESS_SEED_CHILDREN_UNAVAILABLE` gate both ask that one function, and the CSR
prerender twin asks the same question of the same chunks.

## The live bug, and why it was a bug

`<MeterLabel>Tom & Jerry rows</MeterLabel>` seeded `children:"Tom &amp; Jerry
rows"` while the label rendered `Tom & Jerry rows`. The sibling bar puts that cell
in `aria-valuetext`, where it is escaped a second time on the way into the
attribute — so a screen reader said "Tom ampersand-a-m-p-semicolon Jerry rows"
about a label that reads "Tom & Jerry rows". The seed and the render disagreed
about one prop.

They agree now. Measured, on the compiled module:

| written between the tags | chunk statics | emitted seed |
| --- | --- | --- |
| `Tom & Jerry rows` | `Tom &amp; Jerry rows` | `Tom & Jerry rows` |
| `a &lt; b` | `a &lt; b` | `a < b` |
| `a &gt; b` | `a &gt; b` | `a > b` |
| `a &amp; b` | `a &amp; b` | `a & b` |
| `say "hi"` | `say "hi"` | `say "hi"` |
| `a &nbsp; b` | `a &amp;nbsp; b` | `a &nbsp; b` |
| `<em>a &amp; b</em> c` | `<em>a &amp; b</em> c` | `a & b c` |

Every right-hand column is the label's rendered `textContent`. That is the whole
correctness claim, and it is what the browser lane now asserts on both paths.

### What the statics actually are (this corrects U642)

U642 read the escaping as "authored text reaches the statics escaped", which made
`&lt;` look like it would arrive as `&amp;lt;`. Measured, it is sharper than that:
the JSX parser **decodes** the entities it knows, and `escapeHtml` re-escapes the
resulting characters. So the statics are exactly `escapeHtml(rendered text)` —

- `&lt;` decodes to `<`, re-escapes to `&lt;`, and decodes back to `<`;
- `&nbsp;` is not one the parser knows, so it stays six characters, and the bare
  `&` in them escapes to `&amp;nbsp;` — which decodes back to the six characters
  the consumer wrote, and which is also what a browser shows.

That is why the decode is an exact inverse rather than a best effort: it inverts
one named escaper, over bytes only that escaper produced.

The decode is one **left-to-right pass**, never chained replacements. Chaining
`&amp;`→`&` then `&lt;`→`<` would turn the author's literal `&lt;` into a real
`<`. Pinned in three files (compiler helper rows, web twin rows, and the byte
test's `&nbsp;` row).

## The entity table is read off the escaper

Neither side spells a table. Each derives one by running its own package's
escaper over the ASCII range and keeping the characters that came back changed:

    Array.from({ length: 128 }, (_, code) => String.fromCharCode(code))
        .map((character) => [escapeAttribute(character), character])
        .filter(([entity, character]) => entity !== character)

so the decode cannot drift from the escape it inverts, and picks up a new entity
the day the escaper grows one.

**Deviation from the packet, named.** The packet asked for *one* helper used by
both paths. There is no module both can import: `@markless/web` does not depend on
`@markless/compiler`, and making it would put a build-time package in the SSR
runtime. The only shared dependency is `@markless/serializer`, which is the value
protocol and owns no HTML — and is outside this contract besides. So the helper is
a **deliberate twin**, which is what `staticProjectionChildren` already was on
this tip (the web copy's doc comment has said "the CSR twin of the compiler's ..."
since it landed). Compiler side: `public-render/projection-text.ts`, off
`escapeAttribute`. Web side: private to `prerender/children-projection.ts`, off
`marklessSsrEscape`. Both tables come out four entries (`&`, `<`, `>`, `"`) and
both files carry the same rows in their tests. If the owner wants one copy, the
move is an `html-text` module in `@markless/serializer` — a separate unit, and a
new home for HTML knowledge in a package that has none.

## Byte cost — measured, not argued

The only byte the change can move is the seed block's `children:"..."` prop, so
the measurement is: compile every tracked `.tsrx` and ask which modules emit that
literal where they could not have before. **960 tracked files, 959 compile
standalone** (one needs its imports). **20 projections move, in 19 modules:**

One from the decode:

- `packages/vitest-browser/browser/seed-projected-children/page.tsrx` — the
  `Tom &amp; Jerry rows` row this unit added. **No shipped module's static text
  carries `&`, `<`, `>` or `"` into a seeding part.** The decode's byte cost on
  the current tree is zero; it is a no-op everywhere it already ran.

Nineteen from the retired refusal — markup projections that now emit a seed
`children:"<text>"` where the seed block previously passed no `children` at all:

- `apps/sr-gallery/src/Gallery.tsrx`
- `packages/headless/components/src/hovercard/scenarios/` — `basic`, `gapped`,
  `inside-popover`, `rich`, `served-open`, `two-cards` (two edges),
  `with-onchange`
- `packages/headless/components/src/menu/scenarios/` — `context`,
  `context-keyboard`
- `packages/headless/components/src/tabs/scenarios/settings-panels` (two edges)
- `packages/headless/components/src/tooltip/scenarios/icon-button`
- `packages/typescript-plugin/test/fixtures/tsrx-resolution/scenarios/basic`
- `packages/vitest-browser/browser/fixtures/` — `projected-card`,
  `projection-splice-page`, `sbr-child-element`
- `packages/vitest-browser/browser/handles-in-computed/single-page`

None of these seed from `children` — under the old rule they would have been
compile errors if they did. What moved is the seed pass now handing those parts a
`children` string it used to withhold. Those families are outside the packet's
verify block, so their lanes were run anyway: `hovercard`, `menu`, `tabs`,
`tooltip` under `--project ui` — **215 passed, 3 expected fail** — and
`handles-in-computed` under `--project browser` — 4 passed. Nothing regressed.

`emit-byte-equality` gains `seed-children-text-bytes.test.ts`, four rows: text
with nothing to escape emits the byte the chunk already spelled (the unmoved
case), text carrying `&` moves and moves only to what it renders as, markup and
plain text spelling the same text content emit the **same** seed prop, and the
`&nbsp;` row that pins the single pass.

## The refusal that stayed

`MARKLESS_SEED_CHILDREN_UNAVAILABLE` still fires, on `slots.length > 0` — a
projection with an expression in it. Its message and `why` no longer say "markup":
they say a value worked out while the children render. Docs page and catalogue
regenerated by `node scripts/diagnostics-catalogue.mjs`; the diff is exactly the
three files that carry this code's text, no other diagnostic moved.

The three refusal rows the packet named are now behaviour rows, and each left an
expression-slot row behind so the surviving refusal keeps a pin:

- `compiler/test/seed-children/seed-reads-projected-text.test.ts` — markup seeds
  `30 of 100 rows`; a new row seeds `Tom & Jerry rows` decoded; `<em>{30}</em>`
  is still refused with the same span and state path.
- `compiler/test/seed-children/imported-seed-children.test.ts` — same across a
  module boundary, both under the family's own names and the alternates.
- `web/test/seed-children-projection.test.ts` — the CSR twin answers with text
  content, decoded, one pass, attribute values dropped with their tags.
- `compiler/test/seed-children/static-projection-children.test.ts` and
  `compiler/test/seed-markup-children/seed-markup-children.test.ts` — the same
  rows at the helper's own edge. U642's row 4, the escaping witness, is inverted:
  it now pins that the seed does **not** contain `Tom &amp; Jerry rows`.

The browser lane's refusal row is gone with `markup-page.tsrx`; `page.tsrx` grew
a `markup` placement (the bar reads `50 of 100 rows`, the `<em>` still renders)
and an `entity` placement (`Tom & Jerry rows`, the decoded reader value), both
asserted on CSR and SSR. Nothing refuses there any more, so U650's
`clearDevServerErrorOverlay` was not needed — that lane never carried it.

## What this is not

The seeded string is text content, not an accessible name. `aria-hidden`
subtrees, `<img alt>`, and `<style>`/`<script>` content all make it differ from
what a reader computes over the rendered tree. For a label part it is right; the
refusal message does not claim more, and neither should the next reader of this.

Tag boundaries are safe because `>` inside an attribute value is emitted as
`&gt;` (U642's row 3, still pinned), so `<[^>]*>` never cuts in the wrong place.

## Measured

Every command in the packet's verify block, in this worktree, after
`git merge --no-ff feat/headless-ui-pilot` and `pnpm install --offline`:

- `pnpm typecheck` — clean.
- `vp test --project browser seed-projected-children seeded-write nonbubbling-dispatch`
  — 3 files, 13 passed. (14 on the parent: the refusal row is gone, and with it
  the compile error the log used to print.)
- `vp test packages/compiler/test packages/web/test` — 322 files, 2441 passed,
  1 expected fail. **First run of this command reported two failures**,
  `capture-slot-identity` ("no symbol carries two capture slots under one id") and
  `inline-order` ("no shipped family module changes what it emits when a function
  moves above its first component"). Both pass in isolation and both pass on a
  clean re-run of the identical command. Neither can see this change: `inline-order`
  compares one module against itself under a source reordering, so a moved seed
  byte moves on both sides, and `capture-slot-identity` reads capture slots, not
  seeds. Recorded as a flake under load rather than swept — if it recurs, it is
  worth a unit of its own.
- `pnpm docs:errors:check` — 200 codes, in sync.
- `vp test --project ui progress tour toaster` — 79 passed, 2 expected fail.
- `vp lint --deny-warnings` — 0 warnings, 0 errors.

Off-packet, because the byte measurement named them: `vp test --project ui
hovercard menu tabs tooltip` — 215 passed, 3 expected fail; `vp test --project
browser handles-in-computed` — 4 passed.

No completeness receipt is claimed over every reader of the seeded `children`.
What was checked is the two call sites of `staticProjectionChildren` in the
compiler (`ssr-module.ts`, `seed-children-diagnostics.ts`) and the one in
`packages/web/src/fns/shared-seed.ts`, which takes the return unchanged.
