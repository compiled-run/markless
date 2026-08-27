# A factory `computed()` after a factory method's write

**Date:** 2026-08-27
**Answers:** `U624-crop.md` §10 defect 4 ("A `computed()` declared in the `shared()`
factory does not re-derive after a method writes its dependency").
**Related:** `U617-method-reads-computed.md` (a method *reading* a factory
computed), `U621-ink-heldpaths.md` (ink's retirement of the workaround on the
other side of the same seam).

Status: **not reproduced.** No compiler, web or runtime source was changed. The
witness landed green, and it is green at crop's own build-time compiler too, so
this is not "the tip already fixed it".

---

## 1. What the packet expected, and what happened

The packet asked for a red witness at this shape, a localisation in the
derive/dependency lowering, and a fix:

```ts
const rect = state({ x: 2, width: 3 });
const right = computed(() => rect.x + rect.width);
return { ...rect, right, resize() { rect.x = ... } };
```

That shape is green. So are five escalations of it, and so is **crop's own
source** with its rectangle derivations moved back into the factory. Every row
runs CSR and SSR.

## 2. The witness

`packages/vitest-browser/browser/factory-computed-after-method/` — three test files,
16 rows, all green on the tip.

**`family/gauge.tsrx` + `gauge-page.tsrx` + `factory-computed-after-method.test.ts`**
— the packet's minimal shape. Two scalar cells, one factory computed over them,
one factory method writing one cell. A part binds the computed to an attribute
(`ui-right`) and a second part binds it as text; the raw cell is bound beside it
(`ui-x`) as the control that proves the write landed. A second button makes the
identical write from a part handler instead of a method. 8 rows.

**`family/panel.tsrx` (+ `family/panel-math.ts`) + `panel-page.tsrx` + `panel.test.ts`**
— the same thing carrying every structural feature crop's factory has, added one
at a time until the file had them all:

- a cell set with a written type annotation (`const panel: PanelInstanceState = state({...})`), 15 cells, `undefined` seeds among them;
- an `element()` handle and a callback slot (`onChange: undefined as ((rect: PanelRect) => void) | undefined`) beside the cells in the returned object;
- a chain of three factory computeds — `held` (an object, built by an imported helper in a `.ts` beside the family), `heldText` over `held`, `heldStyle` over `held`;
- a method with an early return, which **reads** `held` and then writes five cells including the one `held` reads;
- a root part that writes five prop cells on every render, binds `ui-dragging` to a cell the method writes, and declares its own part-level computed over the same cells;
- parts nested two deep, with `{...rest}` spread onto the host element, an `el={}` handle on the element that carries the binding, and the factory computed bound through `style={}` as well as through an attribute;
- one part that both binds the factory computed and hosts the handler that calls the method.

4 rows. Green at every step of the escalation, not only at the end.

**`crop-copy/` + `crop-copy.test.ts`** — the decisive one. `crop.tsrx`,
`crop-math.ts`, `crop-types.ts`, the `basic` scenario and `visually-hidden.tsrx`
copied verbatim, with two edits:

- `CropRoot`'s `rootReadout` moved into the factory as `readoutText`, and the live
  `<output>` bound to `crop.readoutText`;
- a factory `held` computed added (the `heldRect(...)` pick, returning the
  rectangle object), and `CropSelection`'s `selectionBox` rewritten to read
  `crop.held` instead of rebuilding it from nine cells.

Four rows, real `userEvent.keyboard('{ArrowRight}')` gestures on the focused
selection. The readout walks `40, 30, 200×150` → `41, ...` → `42, ...`, and the
selection's `style` walks `--x: 40px` → `--x: 41px`. Both CSR and SSR.

`crop-copy/` is a duplicate of a shipped family and will drift from it. It is kept
because it is the only receipt that ties this answer to crop's real source rather
than to a model of it; if it becomes noise, delete it and keep `panel.tsrx`.

## 3. The bisect

`git checkout e2f8fd82 -- packages/compiler/src packages/web/src packages/runtime/src`
(the crop commit, whose compiler predates `c57bfd84`, `7516d8b3` and `d403c663`,
none of which is an ancestor of it — so this is the compiler crop was actually
built against), then the same 16 rows: **16 passed**. Sources restored to the tip
afterwards; `git status` clean apart from the new directory.

So the defect is not present on the tip and was not present on the tree crop was
built on. Whatever crop measured, it was not "a factory computed loses its
dependency edge on a method-written cell".

## 4. What this does not rule out

The witness reaches the seam through `render`/`renderSSR` in the browser lane. It
does not exercise a real dev-server page load, a demand-loaded handler module
woken by a first cold gesture, or a pointer drag with capture — crop's own
gestures are pointer drags, and its §10 note 5 records that a gesture settles
through a lazily woken handler module. If crop's freeze was conditioned on one of
those, this witness would not see it.

Two readings of crop §10.4 are left standing, and I cannot choose between them
from here:

1. The factory computed crop declared had a shape neither `panel.tsrx` nor the
   crop copy reproduces — for instance one declared above the cells it reads, or
   reading the instance through the returned object rather than the factory local.
2. The freeze was a symptom of §10.1 or §10.2 in the same session (the module-scope
   `const` in a `state()` seed that unregisters every field, or a cell read nested
   in a call argument that never lowers), and was attributed to the computed
   because removing the computed also removed the read that was failing.

Reading 2 fits the note's own evidence: §10.1 reports that every part-level
`computed()` reading the instance "failed to lower as well" once the seed broke,
which is the same silence from a different cause.

## 5. Can crop and ink move their derived values back into the factory?

**Yes, on the correctness question**, and crop's is measured: `crop-copy/` is
crop's source with `held` and `readoutText` in the factory, and both follow a
method's write in CSR and SSR. Ink already lives there — `U621` moved six methods
onto the `paths` computed and its 59 rows are green.

Two costs to weigh before doing it, neither a correctness risk:

- **Served bytes.** `U617` §3 makes the widget root derive and serve whatever a
  factory computed a method names; `U621` measured that at **+1,705 bytes** on
  ink's SSR module for one three-branch pick. A factory `held` that crop's methods
  read would put `heldRect` on the root's every server render. Crop's methods
  currently rebuild the rectangle from cells, so today crop pays nothing there.
- **Shadowing.** Crop's methods already declare locals named `held`, `now` and
  `sized`. A factory computed named `held` would be shadowed inside every method
  that keeps its local, which compiles and reads correctly but is a trap for the
  next editor. Rename one side before moving anything.

I did not edit crop or ink. If the owner wants the move, it is a separate unit
with the byte delta measured the way `U621` measured ink's.

## 6. Evidence

- `pnpm typecheck` — clean.
- `pnpm exec vp test --project browser packages/vitest-browser/browser/factory-computed-after-method packages/vitest-browser/browser/method-reads-computed packages/vitest-browser/browser/seeded-write packages/vitest-browser/browser/sibling-computed-cells` — 6 files, **36 passed**.
- `pnpm exec vp test packages/compiler/test packages/web/test packages/runtime/test` — 314 files, **2411 passed, 1 expected fail**.
- `pnpm exec vp test --project ui packages/headless/components/src/crop packages/headless/components/src/ink packages/headless/components/src/tour packages/headless/components/src/select` — 4 files, **209 passed**.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- `emit-byte-equality` is trivially satisfied: no compiler source was touched.
- The real-reader lanes were **not** run, per the owner rule.
