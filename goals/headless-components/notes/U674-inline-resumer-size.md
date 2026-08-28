# Inline event-only resumer: where the bytes went, and what the budget is now

The event-only inline resumer (`packages/web/src/inline/resumer.ts`, the
`runInlineResumer` body) is serialized whole into every SSR document, so its
gzip size is paid once per page view. It was failing its bundler size gate.

## The numbers

Everything below is gzip level 9 of the production `event` variant, compiled
through the same Rolldown/OXC path the bundler ships
(`compileInlineResumerSources({ debug: false, executionLog: 'never' })`).

| | gzip | raw |
| --- | --- | --- |
| the budget's original anchor (see below) | 347 | 468 |
| shipped resumer before this change | 1059 | 2668 |
| shipped resumer after this change | 1058 | 2165 |

### The anchor the 700 was set against

`EVENT_ONLY_RESUMER_TARGET_BYTES = 700` entered the tree in `fd0896ac`
(2026-06-15, "poc resumer and improved spec"). `packages/web/src/inline/resumer.ts`
did not exist at that commit. The number was written against the toy source in
the same commit — `eventOnlyResumerSource()` in
`poc/fixtures/proofs/resumer-script/src/resumer-source.mjs`, which measures
**347 B gzip** and does four things: walk the container, index elements, match
`[index, eventName]` pairs against a flat array, and `import()` on a hit.

So 700 was never a measurement of the shipped resumer. It was a toy at 347 with
roughly 350 B of headroom, and the shipped resumer inherited the gate when the
bundler test was pointed at the same constant.

### Growth, by commit

Measured by reconstructing the `runInlineResumer` body out of each historical
revision and re-minifying it (type-strip, drop comments, wrap in the production
const header, OXC minify, gzip). This reproduces the shipping pipeline's number
exactly at the tip.

| commit | date | gzip | delta | what landed |
| --- | --- | --- | --- | --- |
| `6b2134e9` | 08-10 | 691 | — | pre-pilot resumer |
| `f6310066` | 08-23 | 691 | 0 | focus capture + primer (landed in the appended overlay primer, not this body) |
| `55bf560e` | 08-24 | 698 | +7 | one import promise per root (fire-order dispatch) |
| `d72d5302` | 08-25 | 732 | +34 | widget-row served events |
| `2d012be6` | 08-25 | 766 | +34 | arm-escalation: `servedArmRecords` + `escalates` hatch |
| `3f747412` | 08-25 | 766 | 0 | popover resume ordering |
| `0a51563b` | 08-26 | 977 | **+211** | focus-primed preload |
| `154ac175` | 08-26 | 1050 | +73 | cold-trigger-press (press names + text-entry gating) |
| `098eb33e` | 08-26 | 1057 | +7 | pointer-primed hover wake |
| `c13d069e` | 08-27 | 1057 | **0** | non-finite number decode |

Two results worth keeping:

**The non-finite decoder costs this document nothing.** The packet expected
about +62 chars. It is +0 gzip and +0 raw, because the decoder lives inside the
`__MARKLESS_INLINE_GRAPH_SYNC_POLICY__ && __MARKLESS_INLINE_SHARED_GRAPH_POLICY__`
block, which the minifier eliminates from the event-only variant. Pages that
ship the graph-sync-policy variant pay for it; event-only pages do not.

**The first primer is the expensive one; the second was nearly free.** Focus
priming cost 211 B, the hover primer that followed it 7 B — because the hover
primer was a near-copy of the focus primer, and gzip charges almost nothing for
a repeat.

## What was recoverable

Nothing much, in gzip terms — and that is the finding, not an excuse.

The pre-existing source had three obvious redundancies: the boundary arm-record
traversal was written out twice, the focus and hover primers were two copies of
one walk, and the primer wake duplicated the `forward` helper's body. All three
are now removed:

- `armRecordSets` / `keyedRepeats` are derived once and shared by the nested
  event-name set and the component-row hatch.
- One `prime` handler serves both `focusin` and `pointerover`, keyed off
  `event.type`, registered and removed over a `primeEventNames` list.
- Both primers wake through the existing `forward({ event: 0 })`.

That removed **503 raw bytes (2668 → 2165, −19%)** and **1 gzip byte**
(1059 → 1058).

The gap between those two numbers is the whole story. gzip had already collapsed
every duplicated code shape in this file; the compressed size is set by the
distinct content — protocol property names, the event-name literals, and the
control flow — none of which duplication removal touches. Measured attempts that
cut raw bytes and *raised* gzip, all reverted:

| attempt | raw | gzip |
| --- | --- | --- |
| a shared `eventNamesOf` helper | −149 | **+6** |
| `/^(INPUT\|TEXTAREA\|SELECT)$/.test(tagName)` for the four-way `tagName` chain | −60 | **+5** |
| merging the branch and boundary arm-set `.events` maps | −32 | **+2** |
| dropping the text-entry test for a `slice(0, -2)` | −23 | **+2** |

The regex case is the clearest: a regex literal is unique high-entropy text,
while `element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || ...`
is the same 14 characters three times over, which gzip encodes almost for free.
**Do not "optimise" this file by shortening it. Measure gzip, or leave it alone.**

## What the remaining bytes are

Marginal gzip cost of cutting each feature out of the current source and
re-minifying. They do not sum exactly — gzip shares context between them — so
the remainder is carried as a cross term.

| | gzip | raw |
| --- | --- | --- |
| core: locator map, event-record map, one capture listener per event name, module import | 583 | 985 |
| nested records: keyed repeats, async-boundary arm records, branch arms, minted-row hatch | 172 | 479 |
| — of which the escalating-branch hatch (`servedArmRecords`, `escalates`) | 29 | 78 |
| cold-gesture primers: focus and hover wakes | 293 | 696 |
| — of which the hover wake alone | 30 | 80 |
| — of which text-entry gating (`beforeinput`/`input` only for editable hosts) | 66 | 131 |
| fire-order import promise (one promise per root) | 7 | 8 |
| gzip cross term | 3 | — |
| **total** | **1058** | **2165** |

The primers are not negotiable: a first gesture that waits on a demand load is a
runtime bug, and 293 B is what not having that bug costs on this path.

## The budget restatement

`EVENT_ONLY_RESUMER_TARGET_BYTES` is now **summed from that table** in
`poc/fixtures/proofs/resumer-script/src/resumer-source.mjs`, one exported field
per feature, rather than being a hand-picked number. It evaluates to 1058, which
is the measured size — no slack, and no round number to drift toward.

The proof-of-concept source keeps its own gate: `size-report.mjs` now reads
`POC_EVENT_ONLY_RESUMER_TARGET_BYTES = 700`, so that proof still measures 347
against the budget it was actually written to. Leaving both on one constant
would have made the proof vacuous the moment the shipped budget rose.

Three call sites read `EVENT_ONLY_RESUMER_TARGET_BYTES` for the *shipped*
resumer and all move together with it:
`packages/bundler/test/inline-resumer.test.ts`,
`packages/bundler/boxes/ssr-preview.box.ts`, and
`packages/router/boxes/router-preview.box.ts`. (Found by grep over the tree
excluding `node_modules`; not a priced completeness claim.)

## Landmines for the next person

`packages/web/test/render.test.ts:3142` asserts the emitted resumer text
contains the literal `armRecords.keyedRepeats ?? []`. It is a substring pin on
authored source, so renaming that callback parameter turns it red even when
behaviour is identical — which is exactly what happened here and why the
parameter is still named `armRecords`.

Adding a feature to this body means adding a line to
`EVENT_ONLY_RESUMER_ATTRIBUTION` with its measured marginal cost. The gate going
red is the signal that a line is missing, not that the number should go up.
