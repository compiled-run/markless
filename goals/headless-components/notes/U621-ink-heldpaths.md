# Retiring ink's `heldPaths` workaround

**Date:** 2026-08-27
**Follows:** `goals/headless-components/notes/U617-method-reads-computed.md` §5,
which asked the question this answers, and `U611-ink.md`, which found the defect.

Status: **retired.** Ink's `shared()` methods read the `paths` computed declared
beside them. All 59 ink browser rows green, including the row that caught the
original defect.

---

## 1. What came out

Six methods rebuilt the committed drawing from cells on every call. `finish`,
`toSvg` and `toDataUrl` did it through `heldPaths(given, own, seed)`; `undo`,
`redo` and `clear` did it through the same three-branch pick written out inline,
because a copied cross-module body may not name a module import. Each is now one
line:

```ts
const before = paths;
```

Net: 8 insertions, 28 deletions in `packages/headless/components/src/ink/ink.tsrx`.
`heldPaths` stays imported — the five factory computeds still call it, and it is
still exported for consumers.

The methods read `paths` rather than `rows`, `value` or `countText`. All four are
equally correct as reads, but the other three walk into `ink-stroke.ts`
(`strokeRows`, `joinPaths`, `strokeCountText`), and the compiler's fix makes the
widget root derive whatever a method names at every server render, whether or not
the root's own markup needs it. `paths` is a three-branch pick with nothing under
it, so the root pays no walk it was not already paying.

## 2. The served-module byte delta

Measured by compiling the family with `compileTsrxModule` (the base
`visually-hidden.tsrx` interface supplied) and taking
`publicRenderModule.ssrModuleSource`, before and after the edit:

| module | before | after | delta |
| --- | --- | --- | --- |
| `src/ink/ink.tsrx` | 57,649 | 59,354 | **+1,705** |
| `src/ink/scenarios/basic.tsrx` | 14,931 | 14,931 | 0 |

The whole delta is one component. After the edit the emitted module carries
exactly one `marklessSsrServeComputed` call, in `InkRoot` — the component whose
payload selection is `[0,1,2]` cells and `[0,1,2,3,4,5]` computeds, which is the
only selection that holds a record for `paths`. The six other parts emit no serve
call at all: `InkArea` selects computed `[6]` (its own `areaTabStop`), `InkField`
selects `[7]` (its own `fieldAriaInvalid`), and the rest select nothing. That is
U617 §3's mechanism doing what it says — the owner of the record derives and
serves it, and a part that owns no record emits no line that could never land.

Before the edit the module carried no serve call anywhere, which is U617 §5's
"today the fix moves ink not one byte". The +1,705 is the price of correctness,
not waste.

## 3. Evidence

- `pnpm exec vp test --project ui packages/headless/components/src/ink` — **59
  passed**. Named rows checked green individually: `a drawing served whole takes a
  stroke once the page resumes` (the row that caught the original defect), `a
  drawing served whole is edited from the keyboard once the page resumes`, `a
  controlled drawing shows nothing until the strokes are handed back`, `the
  drawing is the controlled prop, else what a gesture wrote, else the seed`, `a
  new stroke ends the redo chain`, `Escape drops the stroke being drawn`, `the
  undo keys cancel the browser default so nothing else claims them`, `an empty
  required drawing stops the form from submitting`, and `undo() called from a
  consumer module is refused at build time`.
- `pnpm typecheck` — clean.
- `pnpm test:sr` — 32 files, 265 passed, 10 expected fail, 4 skipped.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `pnpm test:sr-real` and the real-reader lanes were **not run**, per the owner
  rule.

Timings did not move: the two SSR resume rows run 144ms and 61ms, in line with the
rest of the file's gesture rows.

## 4. What the retirement changes about the family's walls

**Gone.** "No `shared()` method may read a `computed` declared beside it" was ink's
largest finding and is now false; its entry is deleted from
`packages/headless/components/src/ink/note.md` and the file's header comment drops
from two walls to one.

**Still standing, unchanged.**

- **Cross-module `shared()` method calls are refused.** `scenarios/method.tsrx`
  stays quarantined and its browser row stays green. One visible change in the
  refusal's text: the copied body now names `paths` as well as `pad`, so the build
  reports two `MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE` identifiers where
  it reported one. Nothing was ever callable across modules, so no capability was
  lost by making the bodies read a computed — the note's old claim that `undo`,
  `redo` and `clear` were "ready the day the capability ships" was aspirational and
  has been corrected rather than preserved.
- **Read cells into locals before calling anything.** A state read nested under a
  call still has no name to lower to; every computed in the family still reads its
  cells into locals first.

## 5. Not answered here

Ink's `note.md` still describes `scenarios/signature.tsrx` as blocked on the
double-barrel resolution and says the family's 59 rows cannot run. That is stale
on this tip — the scenario imports `../../textbox/index.ts` and the rows do run —
but it is U616's paragraph to correct, not this unit's, and it was left alone.
