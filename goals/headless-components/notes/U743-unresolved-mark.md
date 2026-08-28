# The unresolved-read mark cannot be built as ruled; the parenthesized spend is closed

Two cards. The second landed. The first is **blocked on two independent
measurements**, both of which contradict a premise the card rests on.

## T055 — parentheses no longer flip the verdict (landed)

`spentAt` in `packages/compiler/src/passes/semantic-graph/roster-count.ts` walks
out from a roster-count read through the operations a deferred thunk can still
carry. It stepped through a template literal, a binary, a logical, a unary, a
conditional, a member and a call argument — and stopped at the node the parser
keeps for authored parentheses (`ParenthesizedExpression`, which the yuku parser
preserves). Stopping there meant the walk never reached the printed position, so
the innermost spend was refused instead of deferred:

```
disabled={off === true || (loop !== true && w.step >= total - 1)}   refused
disabled={off === true || loop !== true && w.step >= total - 1}     deferred
```

Same precedence, same expression, opposite verdict — and nothing in the
`MARKLESS_ROSTER_COUNT_NOT_A_NUMBER` message named the parentheses, so the author
had no way to see what they had to change.

One case now steps through the node, exactly as the template-literal step above
it does. Both spellings are pinned in
`packages/compiler/test/render-order-ordinal/roster-count-spend.test.ts`
("parentheses around a spend do not change the verdict"): the parenthesized form
defers with the parentheses preserved in both the printed source and the thunk —

```
source:      off === true || (loop !== true && w.step >= total - 1)
thunkSource: off === true || (loop !== true && w.step >= marklessCountValue(total) - 1)
```

— and the two spellings' thunks are required to agree once parentheses are
stripped. Reverting the one-case fix fails that row and nothing else, so the pin
is on the mechanism rather than beside it.

## T051 — the unresolved-read refusal, blocked twice over

### The mark is not empty for the shipped families. It is 258 pairs.

`U735` §T047 proposed marking "every component that resolves a widget-scoped
definition its OWN module declares while owning none of its cells", and recorded
that the mark would be `[]` for every family in
`packages/headless/components/src`, "so it costs those bytes nothing". That is
the premise the card's compiler pin was to assert.

Measured on this tip by compiling every shipped family module and applying that
exact definition — a component that appears in `semanticGraph.sharedInstances`
for a widget-scoped definition whose id names its own module, and whose
`stateCellIndexes` select no cell under that definition — the answer is **258
component/definition pairs across 47 family modules**, not zero. A sample:

```
accordion/accordion.tsrx  AccordionItemTrigger -> …#accordionState
                          AccordionItemTrigger -> …#accordionItemState
calendar/calendar.tsrx    CalendarTitle, CalendarItem, CalendarTrigger,
                          CalendarLabel, CalendarField, …  -> …#calendarState
tabs/tabs.tsrx            TabsList, TabsTrigger, TabsContent -> …#tabsState
checkbox/checkbox.tsrx    CheckboxTrigger, CheckboxIndicator, CheckboxLabel,
                          CheckboxDescription, CheckboxError, CheckboxField
```

The reason is structural, not incidental. `seeded-family.tsrx`'s `SeededField` —
the fixture the refusal is for — and `tabs.tsrx`'s `TabsList` are the SAME shape
at build time: both resolve a widget-scoped definition their own module declares,
both seed nothing, both own none of its cells, and the module's seeding
component (`SeededRoot`, `TabsRoot`) takes the cells and `rootsWidget: true`.
Nothing in `componentDefinitions` separates them. What separates them is only
what the PAGE renders, which is a runtime fact.

So the mark is not free and it is not inert. Under the ruled refusal, every one
of those 258 parts would throw `MARKLESS_WIDGET_INSTANCE_UNRESOLVED` on a page
that renders it without its family's root — `<TabsList>` with no `<TabsRoot>`,
`<CalendarItem>` with no `<CalendarRoot>`. That may well be the behaviour the
owner wants; it is a behaviour ruling about 46 shipped families, and the packet's
blocked permission names exactly this case.

### The CSR half of the mark needs four files the packet forbids

The mark has to reach `marklessRegisterComposedWidgets` as a field on the compose
child, on both render paths. SSR has a channel the packet's contract can reach:
the carrier publishes it on its own `renderSsr` output
(`widgetFallbacksOutputField`, `ssr-module.ts` / `same-module.ts`), which
composition already reads as `child.widgetFallbacks ?? child.output.widgetFallbacks`.

CSR has no such channel. The browser builds its compose children in
`packages/web/src/prerender/evaluator.ts` (three `ComposeChild` literals, each
filling `widgetFallbacks` from `sharedSeedPass()?.widgetFallbacks?.(…)`), the
reader is `widgetFallbacksOf` in
`packages/web/src/prerender/children-projection.ts`, the slot is typed in
`packages/web/src/prerender/shared-seed-slot.ts`, and the wiring is
`packages/web/src/fns/shared-seed.ts:715`. A second mark needs the same four
edits. All four are outside this unit's contract — the packet holds prerender for
U742 and admits only `fns/composition.ts` and `fns/instance-scope.ts` from
`packages/web`.

The only in-contract alternative is to smuggle the new mark through the existing
`widgetFallbacks` array under a distinguishing spelling (`…#def|part`), which the
CSR plumbing would carry through untouched because a suffixed entry matches no
definition id in `widgetRootsOf` or the `designates` test. That is an
improvisation on a protocol field with a documented meaning, so it was not taken.

### What the design would have been, recorded so it is not re-derived

Worth keeping, because the hard part is already settled:

- **The compiler mark.** Beside `widgetFallbackComponents` in
  `shared-seed-pass.ts`, the components that resolve a declared widget definition
  and own none of its cells; onto the component definition record beside
  `widgetFallbacks`, and onto the SSR output field.
- **The aggregation is monotonic and needs no "top level".** Stamp a marked
  part's composed shared-definition record when it ships one; at every compose
  level, after `marklessMergedSharedDefinitions`, strip the stamp from every
  record of a bare definition id for which SOME record is unstamped. A carrier's
  or an adopter's record is never stamped, so one appearing anywhere below clears
  the family, and the stamp survives to the payload only on a page that really
  rooted the family nowhere. A healthy page pays **zero** payload bytes.
- **Adoption stays legal for free.** `browser/adopted-family-derives`'s
  `part.tsrx` adopts `gauge` from another module, so it is not marked, so its
  record is never stamped, so the family stays page-wide — which is why the
  aggregation needs no second flag distinguishing "carrier" from "adopter".
- **The payload survives the serializer untouched.**
  `packages/serializer/src/protocol-validation.ts` checks named fields on a
  `sharedDefinitions` record and rejects no unknown one, and
  `protocol-state.ts:108` passes the array through, so the stamp needs no
  serializer change — only the closed type in `protocol.ts:170` would want one.
- **The refusal site.** `assertWidgetReadResolved` (`fns/instance-scope.ts:142`)
  already throws `MARKLESS_WIDGET_INSTANCE_UNRESOLVED`; it returns early on a
  BARE definition id today because `registry.rootPaths` is keyed by the qualified
  ids `marklessNoteGraphWidgetRoots` files. The stamp would add a third registry
  member beside `rootPaths` and `rowRooted`, filled in the same loop, and the
  refusal would fire off it before that early return, naming the definition.

### The two questions for the owner

1. Is a family part rendered with no root on the page a **refusal** across all 46
   shipped families — `<TabsList>` alone throws where it reads `undefined` today —
   or should the refusal be narrowed to something that leaves the shipped
   families untouched? There is no build-time fact that narrows it; a narrowing
   would have to be a new authored signal.
2. If the refusal is wanted, may a follow-up unit hold
   `packages/web/src/prerender/{evaluator,children-projection,shared-seed-slot}.ts`
   and `packages/web/src/fns/shared-seed.ts` alongside the compiler and
   composition files, so the mark has a CSR channel?

The three `rootless-page` rows in
`packages/vitest-browser/browser/shared-collection-no-body-writer/` are therefore
untouched and stand as U735 left them, including the `test.fails` row.

## Verification

- `pnpm typecheck` — clean.
- `pnpm exec vitest run --project node packages/compiler packages/web` — green
  (see the run below; the only edited source is `roster-count.ts`).
- `--project browser` on the packet's three suites — unchanged from the tip, the
  same rows expected-failing.
