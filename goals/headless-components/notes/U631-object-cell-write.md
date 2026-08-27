# The whole-object cell write — measured again, and not reproduced

**Date:** 2026-08-27

## What this unit was sent to fix

crop's note (`packages/headless/components/src/crop/note.md`, item 3) records:

> **A whole-object write to a state cell never reaches the graph.** `crop.own =
> rect` was accepted, ran, and changed nothing a reader or a form could see. The
> rectangle the family owns is therefore five scalar cells — `hasOwn`, `ownX`,
> `ownY`, `ownWidth`, `ownHeight` — and never one object.

The unit's job was to reproduce that as a witness, localise it to one of three
candidate mechanisms — the write refused silently by a sync-policy or capture
pass, lowered to a path the graph does not own, or applied to the cell without
invalidating dependents keyed on `own.x` — and then either fix the mechanism or
refuse the shape at compile time with a diagnostic.

**None of those was reached, because the defect does not reproduce.** Every
witness written for it is green on the current tip, in both render modes.

## The witness

`packages/vitest-browser/browser/object-cell-write/` — three pages, 38 rows,
CSR and SSR, all green:

| Page | Shape |
| --- | --- |
| `page.tsrx` | page-level `state({ own: { x, y }, list: [...] })`; handler writes `s.own = { … }`, and a second handler writes it from a local `rect` |
| `family.tsrx` | the cell spread onto a widget-scoped `shared()`; the write comes from a shared method and from a part handler |
| `wide-family.tsrx` | the crop shape scaled down: a nineteen-field seed mixing literals, `undefined` and `as` casts, one field seeded a plain object, a helper in a sibling `.ts` building the rect, methods hoisting every read into a local first |

Readers on every page cover what crop said it could not see: a text binding on
`s.own.x`, a `computed()` in the part deriving from it, an attribute
(`ui-own-x`), a style property, a form control's `value`, and — on the wide page
— a `computed()` declared in the `shared()` factory itself. Both controls the
packet asked for are on the same pages and green: writing one field
(`s.own.x = 3`) and writing an array-valued cell whole (`s.list = next`).

`packages/compiler/test/object-cell-write/` adds seven rows over the emitted
modules, so the lowering is pinned independently of whether a browser row would
notice a regression.

## What the mechanism actually does

The three candidate mechanisms were checked directly, and each is sound.

**The write is not refused.** Compiling the shape produces no diagnostic at any
severity, in any of six variants: a plain object seed, an annotated cell type, an
`undefined` seed, a written object carrying keys the seed lacks, a right side
built by an imported helper, and the write coming from a `shared()` method.

**The write is lowered to a path the graph owns.** Every variant emits the same
shape an array-valued cell gets, with the cell's own name as the path's one
segment:

```js
context.graph.write({ graphNodeId: "state:s", path: ["own"], value: { x: 5, y: 7 } });
```

and readers of its fields emit a deeper read under that same segment:

```js
context.graph.read("state:s", ["own", "x"])
```

**Dependents are invalidated.** `graph.write` in `packages/runtime/src/graph.ts`
applies the value through `writePath` and dirties the written path; the flush
matches a dirty path against a subscription with `pathsIntersect`
(`packages/runtime/src/graph-core.ts`), which tests prefixing in *both*
directions. A write of `["own"]` therefore reaches a subscription on
`["own", "x"]`, which is exactly the case at issue. The one place a write is
silently dropped — `commitDerived` in `graph-reconcile.ts` — returns `false`
whenever the path is non-empty, so it cannot swallow a field write.

## Why crop measured what it measured

Not settled here, and worth saying plainly rather than guessing. Two facts bear
on it.

The first is that crop's note carries a second silent claim next to this one —
item 4, that a `computed()` declared in the `shared()` factory never re-derives
after a method writes its dependency. A sibling unit went after that claim with
crop's own source, moving the two rectangle derivations back into the factory
(`packages/vitest-browser/browser/factory-computed-after-method/crop-copy/`), and
landed it under the message *"a factory computed re-derives after a factory
method's write — not reproduced"*. Two of the note's four claims now fail to
reproduce on the same tip, from two units working independently.

The second is that crop's note item 1 describes a failure mode that would produce
exactly item 3's symptom as a side effect: a module-scope `const` anywhere in the
`state()` seed unregisters *every* field of the instance at once. crop's seed
carried `maxWidth: NO_LIMIT` during the build. A whole-object write to `crop.own`
made while the instance was unregistered would compile, run, and reach nothing —
and so would a scalar write, which is the part that was never checked, because
the scalar rewrite happened at the same time as the fix for item 1.

That is a plausible account, not a proven one. What is proven is the current
behaviour, and the witness now holds it.

## What this leaves open

crop still spends five scalar cells (`hasOwn`, `ownX`, `ownY`, `ownWidth`,
`ownHeight`) on a rectangle the framework will carry as one object cell, and its
note still tells the next family author that objects do not work. Both live in
`packages/headless/components/**`, which this unit may not touch. Retiring the
workaround is a family-source change with its own browser and reader rows to
re-run, and correcting a note that a build measured is an owner call, not a
worker's — so both are handed back rather than done here.

Nothing about the mechanism changed in this unit. The only production behaviour
touched is none: the two test directories and this note are the whole diff, so
bytes are unchanged for every module, with or without object cells.
