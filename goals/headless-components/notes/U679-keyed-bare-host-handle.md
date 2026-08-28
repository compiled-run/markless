# A keyed BARE host's element() binding never reaches the roster its own root reads

U675 closed with a separate red measured on the way and left unpinned: a plural
`element()` handle bound with `el={...}` on a BARE host inside a keyed `@for` in
a widget family's own root answers nothing, even though the module that reads
the handle is the module that binds it — so U675's rule (bind it where you read
it) is satisfied and cannot explain it. This unit pins that red and names what
owns it. No source was changed.

## The measurement

New witness: `packages/vitest-browser/browser/keyed-bare-host-handle/`. Three
pages, one shape each, every page rendering TWO instances of one widget family
and clicking a probe in each. The probe writes back what the family's plural
handle answered, named by each element's `data-name`. A roster that resolved
across instances would read the same four names twice; one that resolved nowhere
reads `undefined`; a probe whose write never lands leaves the cell empty.

The three families are the same family three times over — same factory, same
plural handle, same probe, same two rows per instance. The only difference is
the host that binds.

| page | the host that binds the handle | roster |
| --- | --- | --- |
| `two-static-page` | two STATIC bare `<li>` in the root | `a1,a2` / `c1,c2` |
| `two-row-page` | a COMPONENT of the family, one per keyed row | `a1,a2` / `c1,c2` |
| `two-bare-page` | a BARE `<li>` inside the keyed `@for` | **red** |

CSR and SSR resume agree: 4 green, 2 red. The red rows are marked `test.fails`,
so the lane is green and turns red the day the defect is fixed.

`two-static-page` is the control that makes the red mean one thing. It removes
the repeat and keeps everything else, so a red on `two-bare-page` is the keyed
bare host and not the family, the handle, the widget scope or the probe.
`two-row-page` is the calendar's working shape
(`browser/computed-collection-rows/ccr-widget.tsrx`) reduced to this witness, and
it is green — a keyed row is fine; a keyed row that is a bare host is not.

## The mechanism, at build time

Pinned in `packages/compiler/test/keyed-bare-host-handle/`, four green rows over
the same three shapes.

The read is NOT the divergence. All three shapes lower the root's handler read
identically, to

```
context.getElementHandle("shared:src/Dial.tsrx#dial/element:markEls")
```

so this is a different mechanism from U675's, where the unbound read fell through
to `graph.read` and answered `undefined`. Here the read asks the registry
properly; the registry has nothing to answer with.

What diverges is where the BINDING is planned, in
`packages/compiler/src/passes/payload-arena.ts`:

- **static host** — `view.elementHandles` carries the binding; no keyed repeats.
- **keyed COMPONENT row** — the binding is planned onto the component's own root
  and stays in `view.elementHandles`; the repeat carries no `rowElementHandles`.
  Each minted row is a component instance that registers the handle by the
  ordinary path, which is why the calendar works.
- **keyed BARE host** — `view.elementHandles` comes back **empty**. The binding
  survives only as `keyedRepeats[0].rowElementHandles`.

Two lines make that split. `collect-elements.ts` line 305 marks a binding whose
single keyed-repeat scope resolves to one plural `element()` node as `rowOwner`.
`payload-arena.ts` line 225 then drops every binding that is `rowOwner` or
carries any `keyedRepeatScopeIds` out of `view.elementHandles`, and line 147
re-plans only the `rowOwner` ones into that repeat's `rowElementHandles`.

## Who owns the fix

The build plan is not obviously wrong — it does carry the binding, row-side. The
gap is that a root's handle read is answered from the instance roster, and the
row-side records are only ever consulted for per-row dispatch:

- `packages/web/src/fns/direct.ts` (CSR) — `directRowRecord` (line ~440) fills
  `record.handleTargets` from `repeat.rowElementHandles`, and the ONLY reader of
  `handleTargets` is the `getElementHandle` closure handed to a **row behavior**
  (line ~583). Nothing files those elements into the widget instance's handle
  registry, so the root's read is answered from a roster the rows never joined.
- `packages/web/src/resume-locators.ts` (SSR resume) — this one does have a
  route: `rowMembers` (line ~143) walks the repeat's parent's element children
  for row handles, and `get(id)` unions it into the plural answer. The SSR row is
  red anyway, so either that walk does not reach this shape or its result is not
  what the root's read consults. **This half is measured red but not yet
  explained** — the next unit should step it rather than trust the read above.

The fix therefore belongs on the runtime side of the row mint, not in the read
lowering: `packages/web/src/fns/direct.ts` for CSR, and whatever in
`packages/web/src/resume-locators.ts` is failing to answer `rowMembers` for SSR.
Making `payload-arena.ts` keep the binding in `view.elementHandles` as well is
the other candidate, but a row's element does not exist until the row mints, so
the instance roster would have to be filled at mint time regardless.

## What the red is, and what is still open

The rows themselves are whole. A failure screenshot captured from one of the red
CSR runs shows both widget instances rendered, each with its probe button and its
two keyed rows carrying `a1`/`a2` and `c1`/`c2`. The repeat mints, keys and
labels correctly; the markup is not the defect. Only the handle is missing.

Still open: whether the roster cell reads `undefined` (the read answered nothing)
or stays `''` (the probe's write never landed at all). The witness reports through
a poll bounded at 2s so a row whose write never lands reports the empty cell
instead of spinning. An early run with an unbounded poll spun past ten minutes on
exactly these rows, which points at the write never landing — but the browser lane
on this machine began SIGTERMing every run before that could be captured, so it is
not confirmed. The distinction matters to whoever fixes this: a write that never
lands is a second symptom, not the same one.

## Verification run

- `pnpm typecheck` — clean.
- `packages/compiler/test/keyed-bare-host-handle` — 4 passed.
- `packages/vitest-browser/browser/keyed-bare-host-handle` — observed **4 passed
  / 2 expected fail** on the shape recorded here. That run predates the poll
  bound; every later attempt to re-run the browser lane on this machine was
  killed with SIGTERM before reporting, including runs of untouched files, so the
  lane needs one clean re-run to confirm.

## Relation to live work

Pinned against `feat/headless-ui-pilot` at 607441f2. U678 is live on the compiler
handle-read lowering; it may flip the compiler pin's first row, which asserts
that all three shapes lower the read to `getElementHandle`. That assertion is a
statement about today's tip, not a requirement — a later unit reconciles.
