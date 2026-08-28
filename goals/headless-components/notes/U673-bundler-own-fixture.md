# Bundler route-table tests get their own fixture

The bundler's route-table tests no longer reach into `packages/headless/components`.
They compile a fixture the bundler owns, and the pins are restated with values
measured off that fixture.

## What was wrong

`packages/bundler/test/self-route-recursion.test.ts` transformed
`packages/headless/components/src/tree/scenarios/deep.tsrx` through
`transformTsrxModule` with **no** `importedModuleInterfaces`. The real pipeline
always links those interfaces before it transforms a module. Without them the
compiler refused the file:

```
MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: this @if (depth > 1) cannot be rebuilt
when depth > 1 changes because <FileNode> keeps a `name` of its own that only
running it works out.  (deep.tsrx:32:6)
```

So three rows asserted on a compile that never happened, while the tree family's
own lane rendered the same scenario green (51 rows).

## The compiler is fine — measured

Answering open question 1 of `U661-bundler-budgets.md`.

Recipe used: build the interfaces the way the pipeline does, with
`linkBarrelComponentInterfaces` from `packages/bundler/src/link-driver.ts`, over
a resolve context that resolves relative specifiers on disk, then hand the result
to `transformTsrxModule`.

- **Without** `importedModuleInterfaces`: refuses, as above.
- **With** them: `deep.tsrx` compiles clean, client environment. The barrel walk
  produced 74 interface keys (`../../index.ts`, `../index.ts`, `../tree.tsrx`,
  and every other family module).

No compiler defect to file. The old tests were calling the transform in a way the
build never calls it.

Two things worth carrying forward:

1. With interfaces linked, `deep.tsrx`'s manifest routes name `../tree.tsrx`
   directly — the barrel is flattened to the module that owns the parts. The old
   pins named `../../index.ts`, so even a "just pass interfaces" repair of the old
   tests would have had to restate every pin anyway.
2. Supplying an interface is not by itself what lifts the arm refusal. A minimal
   reproduction — a self-composing component inside an `@if` arm, wrapped in one
   imported part whose interface *is* supplied — still refuses. Something the tree
   family's own parts carry (a branch export, or widget rooting) is what fulfils
   the escalation candidate. Not chased here; it is a question about the
   escalation rule, not a defect in what the pipeline does.

## The new fixture

`packages/bundler/test/fixtures/self-route/`

- `rows.tsrx` — `Node` composes **itself** through a keyed `@for`, with the
  recursive edge projected two component tags deep (`panel.item` >
  `panel.itemcontent`) and imported family parts beside it. The page composes
  `Node` inside `panel.root`.
- `index.ts` — `export * as panel from './panel/index.ts'`, so the fixture reaches
  its parts through a barrel the way a real page reaches `@markless/ui`.
- `panel/panel.tsrx`, `panel/index.ts` — four plain parts; `PanelItem` carries its
  own state so the family owns symbols of its own.

Two shapes the fixture had to respect, both already recorded elsewhere:

- a `@for` over reactive rows needs a key (`MARKLESS_REPEAT_KEY_REQUIRED`);
- an arm or a loop cannot be a direct child of a component tag
  (`MARKLESS_PARSE_ERROR`), so the page wraps its `@for` in a `<ul role="none">`,
  the same forced intrinsic wrapper `deep.tsrx` and `tabs/scenarios/arm-tabs.tsrx`
  record.

## Measured route table

Client transform of `rows.tsrx`, no `importedModuleInterfaces` needed — it
compiles as written:

```
c0:p2:p3:  import("./rows.tsrx?markless-symbols")   self-recursive (Node -> Node)
c0:p1:     import("./index.ts?markless-symbols")    panel.itemlabel
c0:p2:     import("./index.ts?markless-symbols")    panel.itemcontent
c4:p5:     marklessSsrLoadSymbolRoute(slice(6))     self (page -> Node)
c0:        import("./index.ts?markless-symbols")    panel.item
c4:        import("./index.ts?markless-symbols")    panel.root
```

All three route kinds, same as the table the pins were originally measured on.

Pins restated:

| old (deep.tsrx) | new (rows.tsrx) | kind |
| --- | --- | --- |
| `c6:p7:` | `c4:p5:` | self, recurses in place |
| `c0:p4:p5:` | `c0:p2:p3:` | self-recursive, names this module |
| `c0:p1:` | `c0:p1:` | plain child module |

The behavioral row now runs `c4:p5:c0:p2:p3:c0:p1:symbol:0` through the emitted
bytes and expects `./rows.tsrx?markless-symbols -> c0:p1:symbol:0` then
`./index.ts?markless-symbols -> symbol:0`, with nothing falling through to the
local resolver.

## Result

`pnpm exec vp test packages/bundler/test/self-route-recursion.test.ts` — 4 passed.
`pnpm typecheck` — clean. `pnpm exec vp lint --deny-warnings` — 0 warnings, 0 errors.

## Still red in `packages/bundler/test` — neither is this unit's, neither is the music-player budget

`pnpm exec vp test packages/bundler/test`: **2 failed | 500 passed** (67 files).
The music-player budget rows did not fire in this run.

**1. `inline-resumer.test.ts` > "Rolldown OXC deterministically minifies the typed
event-only resumer".** The packet expected this row to be a `deep.tsrx` compile
failure. It is not — it never touches `deep.tsrx`. It is a size budget:

```
AssertionError: expected 1057 to be less than or equal to 700
```

`EVENT_ONLY_RESUMER_TARGET_BYTES = 700` lives in
`poc/fixtures/proofs/resumer-script/src/resumer-source.mjs`. The gzipped
event-only resumer is now 1057 bytes because `packages/web/src/inline/resumer.ts`
grew across the pilot (pointer-primed preload, focus-primed preload, the
non-finite decoders). Fixing it means either shrinking that runtime file or
re-deciding the budget constant — both files are outside this unit's contract and
one of them is a live unit's. Not touched, and the budget was **not** loosened.

**2. `render-order-sweep.test.ts` > "full sweep".** One scenario refuses to
compile:

```
src/menu/scenarios/menubar-trigger.tsrx
Error: menu.trigger cannot be written under a menubar: the bar is always showing,
and each top-level menu.item opens its own menu.
```

Headless-owned, `packages/headless/**` is outside this unit's contract.
