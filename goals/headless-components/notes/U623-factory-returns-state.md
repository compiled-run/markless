# A shared() factory's return IS its cell set

The defect U620 named as its "second face" is fixed at the mechanism, and the
one return shape that genuinely cannot work is refused by name instead of
compiling into a throw. **The unit is blocked one line short of green**: the fix
makes a test in `packages/compiler/test/semantic-graph.test.ts` stale, and that
file is outside this unit's contract. Everything else in the verification set is
green. See "What is blocked" at the end.

## What was measured

A `shared()` factory that returns its state object **directly** — either shape:

```tsrx
export const alphaState = shared(() => state({ tone: 'plain' }), { scope: 'widget' });
// or
export const alphaState = shared(() => { const tones = state({ tone: 'plain' }); return tones; }, …);
```

publishes **no return properties**, so `resolveSharedInstanceGraphPath` answers
`null` for `alpha.tone`, so the attribute keeps the authored text as
`authored-expression` residue, so `readResidue` evaluates `alpha.tone` in a scope
where no `alpha` exists: `ReferenceError: alpha is not defined`, CSR and SSR.

The two shapes fail for *different reasons*, which the earlier memo could not
have seen without the graph dump:

| factory | graph binding for the cells | `returnProperties` |
| --- | --- | --- |
| `() => state({…})` | **none at all** | none |
| `() => { const tones = state({…}); return tones; }` | `…#named/state:tones` | **none** |
| `() => { const tones = state({…}); return { ...tones }; }` | `…#wrapped/state:tones` | `tone`, `note` |

So the anonymous form never declares a cell; the named form declares one and
then fails to publish it. Both land on the same `ReferenceError`.

## Which pass, exactly

`packages/compiler/src/passes/semantic-graph/collect-shared.ts`. Not
`passes/link`, not the runtime.

Two lines did it. `sharedReturnExpressions` treated a concise arrow body as a
return **only when it was an `ObjectExpression`**, and
`collectSharedReturnProperties` then did `if (returned.type !== 'ObjectExpression')
continue`. Every non-object return — a bare name, a member path, an inline call —
fell out of both, and a definition with zero return properties is skipped
entirely (`if (returnProperties.length === 0) continue`).

Nothing was wrong on the residue side. The residue reader is the *fallback*: an
attribute expression that reached no graph read is emitted verbatim by design.
The graph read was never offered.

## The fix

**A named return is now expanded exactly like a spread.** `spreadReturnProperties`
already resolved `...s` to a binding and emitted one `graph` property per key of
its object value; that body is now `graphPathReturnProperties`, and both the
spread and a direct return call it. They differ only in which node carries the
span — a spread's text is `...s` but its path is `s`.

`sharedReturnExpressions` now treats **any** concise arrow body as the returned
expression (`body.type !== 'BlockStatement'`), which is what it always meant.

Measured result: `return tones` and `return { ...tones }` produce the same
property names, the same paths, and the same `graphNodeId` — the factory's own
`…/state:tones` node.

### The one shape that is refused, and why

`return state({…})` — an inline call in return position — is refused with a new
`MARKLESS_SHARED_RETURN_UNNAMED`, naming the factory.

This is not squeamishness about a hard case. A `shared()` cell's node id is a
**wire key**: `shared:<file>#<exportName>/state:<name>`, serialized on the server
and read back on resume, and `<name>` is spelled from the name the cell was
declared with. `specs/framework/03-state-graph.md` states that directly. An
inline call in return position declares no name, so supporting it would mean
minting an id no authored text spells — a new serialized-identity concept, not a
lowering fix. The compiler's one precedent for naming an inline call
(`isChecked: computed(() => …)`) takes the name from the **property key**; a bare
return has no key to take.

The refusal is deliberately narrow: it fires only when the returned expression is
a framework `state()` or `computed()` call. A factory returning anything else the
compiler cannot resolve keeps today's silent-zero-properties behaviour, because
widening it would break shapes nothing has measured.

Docs page regenerated via `node scripts/diagnostics-catalogue.mjs`;
`pnpm docs:errors:check` reports 199 codes in sync.

## What this costs in bytes: nothing

`packages/compiler/test/emit-byte-equality/shared-return-shape-bytes.test.ts`
compiles the same family twice under **one filename** — once returning `tones`,
once returning `{ ...tones }` — and compares `renderDataModuleSource`,
`ssrModuleSource`, `publicRenderPlan`, `protocolState` and `protocolView`. They
are equal. A second test pins that the equality is not two empties agreeing: the
wrapper's render data does contain the `…/state:tones` id and does **not**
contain the authored text `fam.tone`.

## Witnesses

`packages/vitest-browser/browser/factory-returns-state/` — a direct-return family
(`return tones`) read from an attribute and from text, CSR and SSR, with the
wrapper-object family as the control. Red on the tip with
`ReferenceError: direct is not defined` from `readResidue` on both direct tests
and green on both control tests; 4 passed after the fix.

The anonymous `() => state({…})` form is pinned in the compiler suite rather than
the browser suite, because after this change it no longer compiles.

`packages/compiler/test/factory-returns-state/factory-returns-state.test.ts` — 7
tests: the direct/wrapper equivalence, the block-bodied wrapper, both refusal
shapes (`state()` and `computed()`), the wrapper raising no refusal, and the two
repeat cases below.

## What is blocked

`packages/compiler/test/semantic-graph.test.ts` carries

> `buildSemanticGraph refuses a keyed repeat whose shared instance exposes no cell for it`

over a fixture whose factory is exactly `return box;`. It asserts
`graph.keyedRepeats` is empty and that the module's **only** diagnostic is
`MARKLESS_REPEAT_COLLECTION_UNREADABLE`, whose suggestion text tells the author
to write `return { ...box }` instead.

That refusal was a *symptom* refusal, not a design ruling: it fired because the
bare return reached no cell, which is the very defect this unit fixes. With the
fix, `box.items` resolves to `shared:src/List.tsrx#listBox/state:box` with path
`['items']`, the repeat is correct, and the refusal correctly stops firing — so
the test fails, and it is the **only** failure in `packages/compiler/test`
(1738 passed, 1 expected fail, 1 failed).

**Both branches of this unit's goal collide with that one test.** The mechanism
fix breaks it by removing a diagnostic; a refusal-only fix would break it by
adding a second diagnostic to a `toEqual([...])` of exactly one. There is no
version of this unit that leaves the file untouched.

The refusal itself is not weakened, and that is measured rather than argued:
`a repeat over a path the returned cells do not carry is still refused` runs the
same bare-return factory against `box.absent` and still gets
`MARKLESS_REPEAT_COLLECTION_UNREADABLE`.

What the file needs, in one edit: point that test's fixture at a path the
returned cells genuinely do not carry (`box.absent`), and drop the assertion that
the suggestion names `return { ...box }` — the spread is no longer the fix, since
the bare return now works. The neighbouring test
`resolves a keyed repeat over a shared instance to its graph cell` is unaffected
and stays as it is.

## Verification

| command | result |
| --- | --- |
| `pnpm typecheck` | green |
| `vp test --project browser .../factory-returns-state .../double-barrel .../seeded-write` | 16 passed |
| `vp test packages/compiler/test` | **1 failed** (the stale test above), 1738 passed, 1 expected fail |
| `pnpm docs:errors:check` | 199 codes, in sync |
| `vp test --project ui .../select .../tour .../ink` | 151 passed |
| `vp lint --deny-warnings` | 0 warnings, 0 errors |

The bundler suite was not run; it is not in this unit's verification set and its
failures are a known baseline.
