# crop, cleaned up on measurement

**Date:** 2026-08-27

Crop was built against four framework walls it recorded in its own `note.md`.
Since then two were refuted by witnesses (`U631-object-cell-write.md`,
`U630-factory-computed-after-method.md`) and one was fixed in the compiler
(`U632-seed-module-const.md`). This unit retired the workarounds each wall had
forced, but on what the rows say rather than on what the memos say: every step
was applied, measured against the family's own 58 browser rows in CSR and SSR and
the shared reader battery, and kept only because it stayed green.

Only the family was touched. No framework package, no other family, no change to
the parts, props or `ui-*` attributes — `pnpm --filter @markless/ui api:check`
does not move.

## 1. One object cell for the rectangle, in place of five scalars

`hasOwn`, `ownX`, `ownY`, `ownWidth`, `ownHeight` are gone. The family's own
rectangle is one cell:

```ts
own: undefined,          // CropRect | undefined
```

`undefined` is what "no gesture has written one yet" means, the same shape
`given` and `seed` already had, so the boolean disappears with the four numbers.
Every gesture writes it whole (`crop.own = moved`), and `heldRect` in
`crop-math.ts` drops from nine parameters to five:

```ts
heldRect(given, own, seed, minWidth, minHeight)
```

**Kept.** 58 rows green in both modes, reader battery green, and the served
module *shrank* by 6,016 bytes — five cells' worth of protocol plumbing and
nine-argument call sites replaced by one.

`endDrag` needed one real change rather than a mechanical one: it used to rebuild
the reported rectangle from the four scalars, so it could report unconditionally.
It now reads `crop.own` and returns early when the gesture changed nothing *or*
the cell is still empty — the same guard, spelled once.

## 2. The derived values moved back into the factory

Five parts each carried a private `computed()` that rebuilt the rectangle from
the same nine cells. They now read one factory computed:

| factory computed | read by |
| --- | --- |
| `held` | all five shared methods, and the thumb's three edge computeds |
| `readoutText` | the root's live `<output>` |
| `fieldValue` | the form field's `value` |
| `panStyle` | the root's `style` (`--pan-x`, `--pan-y`) |
| `selectionStyle` | the selection's `style` (`--x`, `--y`, `--width`, `--height`) |

The five methods no longer rebuild anything: the nine-line hoist-and-call block
at the top of `beginMove`, `beginResize`, `dragTo`, `moveByKey` and `resizeByKey`
is deleted, and each uses `held` directly.

**The edge coordinates stayed in the thumb, deliberately.** `handleNow`,
`handleText` and `handleHighest` derive from the crop's rectangle *and* from that
handle's own four booleans, which are per-thumb `state()`. There is nothing on
the instance for them to be derived from, so they stay part-level computeds and
now read `crop.held` instead of rebuilding it. That removes the duplication
without inventing a shape the family does not have.

### The U617 cost, measured

`U617` §3: the widget root derives and serves whatever factory computed a method
reads. `held` is read by methods, so the root's server render gains exactly one
serve call, and it is the only one in the module:

```
in marklessRenderSsr: marklessSsrServeComputed(marklessSsrPayloadState, marklessSsrRenderStateValues,
  ["shared:packages/headless/components/src/crop/crop.tsrx#cropState/computed:held"]);
```

`readoutText`, `fieldValue`, `panStyle` and `selectionStyle` are read by parts
only and emit no serve call, which is the same split `U621` measured on ink.

The net is still a smaller module, because the duplication removed is larger than
the serve call added. Measured with `compileTsrxModule`, taking
`publicRenderModule.ssrModuleSource` (the base `visually-hidden.tsrx` interface
supplied), the way `U621` measured ink:

| stage | bytes | delta |
| --- | --- | --- |
| before | 78,099 | — |
| after the object cell | 72,083 | **−6,016** |
| after the factory move | 69,998 | **−2,085** |
| net | 69,998 | **−8,101** |

`marklessSsrServeComputed` calls: 0 → 1.

## 3. `Number.POSITIVE_INFINITY` for no-limit — measured, and refused

The two size caps stay `undefined`-means-no-limit. This is not deference to the
old note; it is what the rows did.

Seeding `maxWidth` and `maxHeight` with `Number.POSITIVE_INFINITY` compiles
clean — no diagnostic at any severity, which is the seed fix working — and then
turns **8 of the 58 rows red**, in CSR as well as SSR. The failures are not
confined to the caps:

| row | expected | got |
| --- | --- | --- |
| the starter renders | `{x:40,y:30,w:200,h:150}` | `{x:0,y:0,w:40,h:40}` |
| a disabled crop is out of the tab order | `tabindex="-1"` | `"0"` |
| the field carries the rectangle a form would send | `name="crop"` | `""` |
| a handle reports its edge | `aria-valuemax="240"` | `"40"` |

That is the whole shape reading empty, not one cap misbehaving. It is `U632`'s
named residual: `evaluateInitialStateValue`'s fold is all-or-nothing over the
seed object, `Number.POSITIVE_INFINITY` is unfoldable, so the cell registers its
fields (the fix) but carries no value to the protocol cell (the remainder), and
every read of the shape comes back `undefined`.

The breakage is pinned to the **seed**, not to the written value: leaving the
seed `undefined` and defaulting the two props to `Number.POSITIVE_INFINITY`
instead keeps all 58 rows green. So a cap written at runtime travels; a cap
*seeded* does not.

Both probes were reverted. Nothing is lost by waiting — `sizeCeiling` in
`crop-math.ts` already reads `undefined` as no cap — and the change becomes free
once the payload half of `U632` lands (the authored expression carried into
`protocolState.cells`, or a non-finite number encoding in
`packages/serializer`; `encodeSlot` in `value.ts` returns a number bare, so
`Infinity` prints as `null` today).

## 4. `note.md` §10 rewritten

The section is now "The framework walls this family met", and it says what is
true:

- **Wall 1 (seed that is not a bare literal): fixed**, with the residual limit
  stated and the 8-row measurement above as its receipt.
- **Wall 2 (a cell read nested in a call argument does not lower): kept.** Still
  true; still why every shared method hoists its reads into locals first.
- **Wall 3 (whole-object write): deleted**, restated as "not a wall — it does not
  reproduce", with the `own` cell as the standing evidence.
- **Wall 4 (frozen factory computed): deleted**, restated as "not a wall", and
  attributed to wall 1, whose symptom was every derived read on the instance
  coming back empty at once.
- The settle-after-gesture testing fact is now one line pointing at SPEC
  "Testing", which carries the rule.

The byte delta is recorded in the note too, so the next editor sees the price of
the factory `held` without opening the goal notes.

## Evidence

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project ui packages/headless/components/src/crop` — **58
  passed**, CSR and SSR.
- `pnpm --filter @markless/ui api:check` — 3 passed; the manifest does not move.
- `pnpm test:sr` — 34 files, 281 passed, 10 expected fail, 4 skipped.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `pnpm test:sr-real` and the real-reader lanes were **not run**, per the owner
  rule. They belong to CI.

Baseline for all of the above was taken green on this worktree before the first
edit, so every number is a delta and not an inherited state.
