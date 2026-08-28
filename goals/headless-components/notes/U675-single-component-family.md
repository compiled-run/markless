# A single-component family's element() roster: not the partition

The packet's premise was that a widget family module declaring ONE component
emits no node partition, and that the missing partition is why its `element()`
plural roster reads `undefined` for every instance. Measured, that premise is
false. The component count does not decide it. What decides it is whether the
module that READS the handle also BINDS that handle in its own markup.

## The measurement

New witness: `packages/vitest-browser/browser/single-component-family/`. Every
page renders TWO instances of one widget family and clicks a probe in each; the
probe writes back what the family's plural `element()` handle answered, named by
each element's `data-name`. A roster that resolved globally would read the same
four names twice; one that resolved nowhere reads `undefined`. Two of the pages
also read a SINGULAR handle the root binds on its own head.

| page | family module declares | who binds the plural handle | roster | singular |
| --- | --- | --- | --- | --- |
| `two-static-page` | 1 component | the root itself, static hosts | `a1,a2` / `c1,c2` | `a` / `c` |
| `two-static-controls-page` | 2 components | the root itself, static hosts | `a1,a2` / `c1,c2` | — |
| `two-v2-page` | 2 components | a same-module sibling; the rendered parts are in ANOTHER module | `a1,a2` / `c1,c2` | — |
| `two-dials-page` | 1 component | only parts in another module | **`undefined` / `undefined`** | `a` / `c` |
| `two-controls-page` | 2 components | only parts in another module | **`undefined` / `undefined`** | — |

CSR and SSR resume agree on every row: 6 green, 4 red.

Read down the "family module declares" column and the reds do not sort. Read
down "who binds" and they sort exactly: every page whose reading module binds
the handle somewhere in its own markup is green at BOTH component counts, and
every page whose reading module never binds it is red at both. `two-v2-page` is
the decisive row — two components, the parts that actually render live in
another module, and it is green because the family module happens to contain one
binding of the handle.

The singular handle is green everywhere, because the root that reads it is also
the component that binds it.

## Why U670's memo read this as the partition

`adopted-family-derives`'s family module gained `PanelMark` as its second
component, and the roster rows turned green. `PanelMark` binds
`el={g.marks}` — so that edit added a BINDING to the reading module at the same
time as it added a component. The component was the visible half; the binding was
the operative one.

## The mechanism, at build time

Pinned in `packages/compiler/test/single-component-family/unbound-handle-read.test.ts`.
Compiling a family module whose root only READS the handle emits, for the probe
handler:

```
context.graph.write({ graphNodeId: "shared:src/Dial.tsrx#dial/state:d", path: ["roster"],
  value: rosterOf(context.graph.read("shared:src/Dial.tsrx#dial/element:markEls")) });
```

An `element()` handle is not a graph value, so `graph.read` on its node answers
`undefined`. The same module with one `el={d.markEls}` binding added emits
`context.getElementHandle(...)` instead, which the resume registry answers with
the live node — per instance, which is what the green rows show.

The chain, all of it outside this unit's file contract:

- `elementHandleValueLowering` (`packages/compiler/src/passes/symbol-modules.ts`,
  line 6425) returns `null` when no record in `handleReads` matches the read's
  source text. The read then falls through to the `graph.read` above.
- `handleReads` comes from `elementHandleReads`
  (`packages/compiler/src/passes/symbol-resolver.ts`), which keeps only reads
  whose graph node id is in `elementHandlesByGraphNodeId` — and that map is built
  from `payloadArena.view.elementHandles` plus the keyed-repeat and async-arm
  handle lists.
- Those lists are BINDING sites: each record carries a `hostNodeId`
  (`packages/compiler/src/passes/payload-arena.ts`, the
  `elementHandles.filter((handle) => armHostIds.has(handle.hostNodeId))` shape),
  so a module that never writes `el={...}` contributes no handle record at all.

The fix is to resolve the read against the handle the family DECLARES rather
than against the ones this module binds. The graph node id already carries
everything needed — `shared:src/Dial.tsrx#dial/element:markEls` names the
definition and the handle — so `elementHandlesByGraphNodeId` could admit every
`element()` DECLARATION reachable from the module's `shared()` factories, not
only the bound ones, and `elementHandleValueLowering` would then lower the read
the same way it lowers a bound one. This is U669's finding on the same
mechanism.

## Contract

`packages/compiler/src/passes/symbol-modules.ts` and `symbol-resolver.ts` are
outside this unit's contract, which admits only
`packages/compiler/src/passes/public-render/**` of the compiler; `payload-arena.ts`
and `semantic-graph/**` are named forbidden. The two runtime files this unit does
own — `packages/web/src/fns/element-handle-roster.ts` and `shared-seed.ts` — serve
the IDREF roster (which handles a rendered instance binds, so an IDREF names an
element that exists). They cannot reach this defect: the handler's read never
becomes a `getElementHandle` call, so it never consults the registry those files
file into. No source change was made.

## Bytes

None. Nothing in `packages/compiler/src` or `packages/web/src` was touched, so
`emit-byte-equality` is untouched and no module — single-component or otherwise —
moves a byte.

## A separate red, measured on the way

A plural handle bound with `el={...}` on a BARE host inside a keyed `@for` in a
widget family's own root reads `undefined` too, at both component counts and even
when the reading module binds it. The working shape is the calendar's
(`browser/computed-collection-rows/ccr-widget.tsrx`): the row is a COMPONENT that
binds the handle, not a bare host. This is not pinned here — the witness avoids
it by binding on static hosts and on parts — and it is a separate question for
the board.

## Verification run

- `pnpm typecheck` — clean.
- browser pins: `adopted-family-derives`, `enclosing-family-read`,
  `handle-in-arm`, `own-instance-handle`, `idref-per-instance`, `root-idref`,
  `nested-widget-outer-write`, `seeded-write` — 12 files, 92 passed.
- ui: toggle, progress, tooltip, menu, toolbar — 6 files, 329 passed, 1 expected
  fail.
- `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.
- The new witness is 6 passed / 4 failed by design, and the new compiler pin is
  1 passed / 1 failed by design. Both reds are the defect; they go green when the
  lowering above is fixed.
