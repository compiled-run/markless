# Reading an enclosing family's instance from a part that roots its own

Measured on the pilot tip, witness `packages/vitest-browser/browser/enclosing-family-read/`,
18 tests green, CSR and SSR resume identical in every case.

The owner direction this measures: `toolbar.root` / `menubar.root` are widget roots, and any
family rendered inside one registers its focusable element into the enclosing instance's roster
by reading `toolbar.state()`. No wrapper part in between. That needs two things to be true —
the enclosing read has to resolve upward across a family boundary, and it has to resolve to
*none* when no toolbar encloses the control.

## What the witness renders

`bar.tsrx` declares `barState` (`{ scope: 'widget' }`, holding `role`, `label`, `active`,
`moves`, `roster` plus a plural `itemEls` handle) and `Bar`, which seeds it and so roots it.
`Bar` carries a probe button that writes the roster's `data-name`s into `bar.roster`, and a
keydown handler that roves `active` over `itemEls` with Left/Right.

Three registering axes, so a failure names its own cause:

- `BarItem` — same module as `Bar`, roots nothing. The baseline.
- `Plain` (in `knob.tsrx`) — another module, roots nothing. Isolates "cross-module".
- `Knob` (in `knob.tsrx`) — another module, roots `knobState` of its own, and binds
  `el={bar.itemEls}`. The shape the toolbar actually needs.

## What each case does today

| page | roster(s) read back |
| --- | --- |
| one bar, same-module items | `a,b,c` |
| two bars, same-module items | `a,b,c` / `d,e` — isolated |
| one bar, other-module items rooting nothing | `a,b,c` |
| two bars, other-module items rooting nothing | `a,b,c` / `d,e` — isolated |
| one bar, knobs rooting their own family | `a,b,c` |
| **two bars, knobs rooting their own family** | `a,b,c,d,e` / `a,b,c,d,e` — **both bars see every knob** |
| **one bar plus a knob outside it** | `a,b,loose` — **the outside knob is in the bar's roster** |
| a knob alone, no bar anywhere | renders, does not throw, its own family still works (`taps` 0 → 1) |

Roving is real: on the one-bar page Left/Right move `active` 0 → 1 → 2 → 1 and focus follows
onto the matching knob, CSR and SSR alike. So the registered elements genuinely are the knobs,
in document order.

## The answers the packet asked for

**(1) Does a part of family A that roots its own widget resolve family B's enclosing instance?**
For *state*, yes — `nested-widget-outer-write` already pins that, and `Bar`'s own `label`/`role`
stay per instance here. For an `element()` *registration*, no. It resolves correctly only when
one bar is on the page, and that is the raw-id fallback answering, not a resolution.

**(2) With no enclosing B, what happens?** Not a throw, and not none. `shared()` does not mint a
visibly separate instance either — the loose knob's registration lands on the same unqualified
handle id as every other knob's, which is why an unrelated bar reads it as one of its own items.

So the capability the toolbar depends on is **not** merely missing an optional read. The
enclosing read is broken for handle registration first, and "no enclosing B does not resolve to
none" is a symptom of that same break, not a separate gap.

## Where the break is

`marklessWidgetHandleId` (packages/web/src/fns/instance-scope.ts) qualifies a widget-scoped
handle id by asking `marklessComposedGraphNodeId`, which walks prefixes of the reading instance
path against `registry.rootPaths` (`widgetRootPathFor`, same file). The reading half,
`marklessInstanceScopedElementHandle`, asks the qualified id first and falls back to the id
exactly as compiled.

The measured behaviour is exactly what an unqualified registration would produce: with one bar
the raw fallback answers correctly, and with two bars both bars' qualified lookups miss and both
fall back to the one raw id that now holds all five knobs. The registration losing its
qualification is the whole defect, and rooting a family of one's own is what loses it — the
same-module and other-module axes, which differ only in that, stay isolated across two bars.

What I could not settle inside this unit's file contract is *which* pass drops it. The
candidates that qualify a handle registration for a component that roots its own widget reach
`packages/web/src/fns/ssr.ts` (lines 1387 and 1608) and the shared-seed / public-render passes,
none of which this unit may touch. Naming the file on a guess would have been improvisation.

## The API question, deferred on purpose

The optional read was to be `barState.enclosing()` returning the instance or `undefined`, versus
`barState({ optional: true })`. On SPEC.md's capability-naming rules `.enclosing()` is the better
name: it is a call form on the factory beside `.state()`, it says what it resolves rather than
how it behaves on failure, and it needs no options object the compiler would have to prove is a
literal. Recording it as the owner-confirmable default.

But it should not be built yet. An optional read layered on a registration path that already
cross-contaminates two sibling bars would ship a false capability: `enclosing()` would answer
"yes, a bar" for a knob standing outside every bar, because that knob's registration is already
indistinguishable from an enclosed one. Fix the qualification first; then decide whether the
optional read is still needed or whether correct qualification already answers "none" for free.

## Owner decision needed

**Which unit owns the qualification fix.** Recommended: re-cut it with `packages/web/src/fns/ssr.ts`
and the shared-seed pass in contract, because that is where a registration from a component that
roots its own widget is spelled, and this unit was fenced out of all of them.

**Whether `.enclosing()` lands with that fix or after it.** Recommended: after, because correct
qualification may already make a knob outside every bar register nowhere, which is the whole
behaviour the optional read was being added to buy.

The witness is already written for both. The two rows marked DEFECT in
`enclosing-family-read.test.ts` pin today's wrong answers, so the fix has something to flip and
cannot land silently.
