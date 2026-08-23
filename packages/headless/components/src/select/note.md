# select — implementation notes

Research: `goals/headless-components/notes/research-select.md`.
QDS source read as structural truth: `~/dev/open-source/qwik-design-system/libs/components/src/select/`.

## Shape

Eight parts, the QDS folder listing exactly: `select.root`, `.label`, `.trigger`,
`.content`, `.item`, `.itemlabel`, `.itemindicator`, `.field`. QDS's own
lowercase compound spelling, forced because a JSX member tag cannot carry a
hyphen.

One widget family, `selectState`, rooted by `select.root`: `value`, `open`,
`disabled`, `required`, `name`, the two typeahead cells, the `labelEl` and
`contentEl` handles, the consumer's `onChange` and `onOpenChange`, and
`choose()` / `setOpen()`. It is exported as `state` beside the parts, per the
owner's namespace ruling.

`selectItemState` is a second widget-scoped family rooted by each `select.item`,
holding that option's `value` and `disabled`. It is exported as `itemstate` for
a consumer whose own part sits inside an option, matching radio group.

**The typeahead buffer is two graph cells and a `Date.now()` comparison.** QDS
holds two class instances here — `SelectNavigation` (five memo fields over four
parallel arrays) and `SelectTypeahead` (a search string plus a live `setTimeout`
handle). Neither is needed and neither would be allowed: the landed
`MARKLESS_SHARED_FACTORY_CLASS_INSTANCE` diagnostic refuses a class instance on
a `shared()` factory. `search` plus `searchAt` replaces the timer, and every
navigation question is answered by a DOM walk from `event.target`, so there is
no item registry in this family at all.

**Every DOM query the family makes lives in `element-reach.ts`.** No handler in
`select.tsrx` holds a DOM reference: each one hands `event.target` to a named
function that does one job. Two framework walls, both measured below, are why
that module exists at all; the section "What a handler cannot reach" states them
and what would close them.

## Deviations from QDS, and the constraint that forced each

1. **`role="combobox"` on the trigger.** QDS ships `aria-haspopup="listbox"` on
   a bare `<button>`, which a reader announces as "button, collapsed" and which
   fails aria-at's `Role 'combobox' is conveyed` assertion. This is a deliberate
   behaviour deviation, argued in research §2.1, and `select.sr.ts` is what
   holds it.
2. **`aria-labelledby` on the trigger names the label part only.** QDS writes a
   two-id list, `"{label} {trigger}"`, including a label id that may not exist.
   A handle list in an IDREF position is `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`,
   so the trigger names one handle — the one `select.label` binds. That is also
   the APG select-only example's own shape, and it removes the dangling
   reference a select written without a label part would carry.
3. **`value` is required on `select.item`.** QDS falls back to `value ?? String(index)`
   from a construction-order counter. Markless seeds are order-independent and
   the owner ruled out a runtime creation-order counter, so an option is named
   by its value and nothing counts positions. Same ruling as tabs, radio group
   and otp.
4. **No `multiple`.** Research §9 question 3, recommended "later": it is the one
   prop that turns `value` into a union and doubles the keyboard table. Six of
   seven surveyed libraries carry it, so this is a scope decision, not a
   capability one.
5. **No `displayValue`, and no `value` part to replace it.** See below.
6. **`select.field` carries the chosen value, not the whole option list.** QDS
   rebuilds a `<select>` with an `<option>` per registered item. There is no item
   registry here, and none is needed: a single-option `<select>` submits the same
   name/value pair, which is what `only the chosen option appears in what the form
   submits` proves. The empty value submits as `{"plan":""}`, which is what a
   native `<select>` with no choice does.
7. **No `ui-highlighted`.** QDS tracks a `highlightedIndex` cell and reflects it.
   This family roves real DOM focus, so `:focus` is the highlight and a consumer
   styles it with the platform's own selector.
8. **`{...rest}` is spread first**, so a consumer cannot silently overwrite the
   ARIA state. QDS spreads it last on several parts. Same call tabs made.

## Roving DOM focus, not aria-activedescendant

Research §9 question 1 recommended roving, matching QDS, Radix, Kobalte and
Bits. The compiler settles it outright:
`packages/compiler/src/passes/semantic-graph/idref-attributes.ts` leaves
`aria-activedescendant` out of `IDREF_ATTRIBUTES` deliberately, because it names
one row of a live collection. So the activedescendant model is not expressible
today and roving is the only model this family could ship.

## The `displayValue` claim, measured — and disproved

Research §7 predicted that because the popup is never unmounted, the option list
is in the DOM at first paint, so the trigger could show a preselected value's
**label text** without QDS's `displayValue` prop.

It cannot, and the reason is not about mounting. QDS's folder listing has no
`value` part, so the trigger's words are consumer-authored in QDS too; QDS
reaches the label through its item registry (`itemLabelText`, read by
`getSelectedLabels`). This family has no registry by design, and a consumer
`computed()` cannot query the DOM, so nothing maps a value back to its option's
label. `prefilled.tsrx` therefore authors the trigger's text directly, which is
the honest shape. Restoring the QDS behaviour needs either a value-to-label
registry or a `select.value` part that reads the chosen option — neither is in
the QDS part list, so both are owner decisions rather than an implementation
gap.

## What the compiler forced — measured on this tip

Everything below was measured by running the suite, not assumed.

1. **A module-scope helper returning an array is refused.** Research §6d
   sanctioned one pure module-scope helper (`matchOption`) on the strength of the
   f18b6c23 declaration-carry commit. Written that way, the module fails with
   `MARKLESS_STATE_HELPER_RETURN_UNSUPPORTED`: *"Cannot connect helper
   'enabledOptions' return value to graph state. This slice supports returning
   one state() or computed() binding directly."* A same-module function called
   from a component body is read as a state helper regardless of what it
   returns. Both DOM walks are therefore written out in each handler that needs
   them, which is what the twelve shipped families already do.
2. **A two-parameter shared method aborts the handler.** `select.typed(search, now)`
   compiled with no diagnostic and then silently killed the rest of the handler:
   the popup never opened and the roving focus never moved (7 red rows). The
   otp note records a **one**-parameter method working, so the boundary is
   arity, not parameters as such. Rewritten as two cell assignments in the
   handler (`select.search = search; select.searchAt = now;`), the same rows are
   green. This is the sharpest finding in the unit and it narrows the
   parameterised-method capability the research leaned on.
3. **A `computed()` read from a handler body does not guard.** `select.item`'s
   click rule was written `if (locked !== true)` over a
   `computed(() => item.disabled || select.disabled)`. The guard let a disabled
   option be chosen in both CSR and SSR. Reading the two state cells instead
   (`item.disabled !== true && select.disabled !== true`) fixes it. The same
   computed is correct in every *render* position on the same element —
   `aria-disabled` and `ui-disabled` are right — so this is specifically the
   handler-body read path.
4. **`preventDefault()` from a deferred handler cannot suppress the native
   click.** Enter and Space on the trigger were in the prevented key set and
   still produced a click, so the key rule opened the popup and the click
   toggled it straight back shut. They are now absent from both the prevented
   set and the opening set: the button's own activation opens the popup, and the
   key rule only lands the roving focus. What a person experiences is unchanged.
5. **Focus into a freshly opened listbox needs more than one frame.** The
   listbox is `hidden` until the open cell reaches the DOM, and nothing inside a
   hidden subtree can take focus. A single `requestAnimationFrame` landed the
   first open and raced later ones (4 intermittently red rows). The landing is
   now retried per frame, up to twelve, until `document.activeElement` is the
   option it aimed at.

## What a handler cannot reach — measured on this tip

The owner's order is that no part of the library selects DOM nodes: references
and id lifetimes go through markless primitives. Select cannot meet it yet, and
the reason is two walls rather than a shortcut anyone took. Both were measured
here by writing the primitive-based shape and running the suite.

**1. A handle read in a handler answers for one widget on the page, not for the
handler's own widget.**

*The read-as-undefined half of this wall is fixed. The instance half was
re-measured 2026-08-23 against the landed per-instance fix, and it is what still
holds the family to `element-reach.ts` — it now fails loudly rather than
silently.*

The original wall was that an `element()` handle resolved in `el=` and in an
IDREF attribute but read as `undefined` from a handler body, silently, with no
diagnostic. Measured then: the trigger's key rule was written
`const list = select.contentEl;` and gated on `list !== undefined`. Eighteen rows
went red, including `Alt+ArrowDown`, which only calls `setOpen(true)` and never
touches the list. Dropping that one guard turned `Alt+ArrowDown` green again, so
the guard — not the handler — was what failed: the handle read `undefined`.

That half is closed. `element() handles resolve as values in handlers` landed on
this branch, witnessed by `packages/compiler/test/element-handle-values.test.ts`,
and shared-instance members are included: `focusOpeningOption(select.contentEl,
search, isFromEnd)` and `select.triggerEl?.focus()` both compile with no
diagnostic and emit `context.getElementHandle("shared:…/element:contentEl")`.

What the read does not do is answer per widget instance.
`ProtocolViewPayload['elementHandles']` records `{hostNodeId, handleId, name}`,
and the `handleId` of a widget-scoped handle is one module-level string shared by
every instance of that widget. `materializeElementHandles`
(`packages/web/src/resume-locators.ts`) files those records in a flat
`byHandleId` map, which `resume-events.ts` hands to event symbols as
`getElementHandle`. Last registration wins, so every handler on the page — in
whichever widget — is given that one element. An IDREF position is unaffected,
because the id is minted on the element itself: that is why
`aria-controls={select.contentEl}` has always named the right listbox.

Measured 2026-08-23, writing the whole four-site conversion this family wants
(the listbox read off `select.contentEl`, the trigger focused off a new
`select.triggerEl` bound with `el=`): 54 browser rows, 53 green, with `CSR: the
arrow walk skips an option nobody may choose` red. Its scenario,
`unavailable-options.tsrx`, is the only keyboard scenario carrying two selects,
and the walking one is first of the two. Focus never left the trigger, because
`focusOpeningOption` was handed the *second* select's `hidden` listbox and
nothing in a hidden subtree can take focus. Moving the locked select ahead of the
walking one — the same handler code, only the registration order changed —
returned all 54. That is the flat map, not the walk.

**Re-measured 2026-08-23 against the landed per-instance fix, and it is still one
row red — for a new reason.** `widget-scoped element() handle reads resolve per
instance` (`packages/web/src/fns/instance-scope.ts` qualifying a widget-scoped
handle id with the rendered widget's root path, `resume-locators.ts` filing per
key and refusing an ambiguous one) is on this tip, and its own suite,
`packages/vitest-browser/browser/handle-instance.test.ts`, is 9/9 here. The
family's suite is 54/54 before the conversion. With the conversion re-applied
exactly as written above: 53 green, the same row red, and the wrong element is
gone — the read now throws
`MARKLESS_ELEMENT_HANDLE_INSTANCE_AMBIGUOUS`, *"Element handle
`shared:…/select.tsrx#selectState/element:contentEl` is registered by 2 rendered
widgets on this page, and the reading handler named no instance."* The throw is
the fix working as designed: the fallback to the module-level id is refused
rather than answered with whichever widget registered last.

What was ruled out, each by its own run:

- **Not the member-tag spelling.** The same two-select page written with direct
  component tags (`<SelectRoot>`, `<SelectTrigger>`, `<SelectContent>`) instead
  of `select.root` and friends throws identically.
- **Not the nested widget.** Replacing every `select.item` — each of which roots
  a `selectItemState` instance of its own — with a plain
  `<div role="option" tabindex={-1}>` throws identically.
- **Not a sibling-part read.** The narrower conversion, where only
  `select.content`'s own key handler reads `select.contentEl` — the handle that
  same part binds with `el=` — and the trigger keeps its DOM hop, throws from
  `symbol:2`, the content's handler. A handler on the very element that binds the
  handle names no instance either.

So the per-instance keying holds for the shape its fixture pins (a widget root
component whose two children are a binding part and a reading part, both direct
children) and does not reach this family's. The next question is which of the two
halves loses the path: the registration qualifying under one instance path, or
the reading symbol resolving under another. Both live in
`packages/web/src/fns/instance-scope.ts`, outside this folder. Until one of them
answers, `element-reach.ts` stays exactly as it is — the conversion above is
written out in full so it is re-appliable in one sitting.

The older half of the wall still stands beside it: `attach={(host) => ...}` is
the only primitive handed a live element, and it cannot pass one on. Writing it
to a plain instance field is `MARKLESS_SHARED_SEED_UNKNOWN_FIELD` ("declares no
graph field named 'triggerNode'"). Declaring that field with `state()` instead
clears that diagnostic and hits
`MARKLESS_SYMBOL_MODULE_UNRESOLVED_GRAPH_REFERENCE`: the emitted behavior module
still names the shared binding, because a behavior is compiled into a module of
its own and no graph write is lowered into it. So a behavior can touch its own
host element and nothing else.

So the trigger still reaches its listbox through the id markless minted for it
(`aria-controls` → `getElementById`) and the listbox still reaches its trigger
back through the same id. The id lifetime is the framework's; only the lookup is
not.

What would close it: a handle read that carries the reading handler's widget
instance, so `getElementHandle` answers per instance instead of per module. With
that, the conversion above removes four of this family's six queries, and the
same four in radio group, tree and navbar. The two that walk the options stay
either way — they are wall 2.

**2. Nothing yields the rows of a repeated part in order.**

The arrow walk and the typeahead need the options under one listbox, in the
order a person walks them, with the disabled ones left out. No primitive
produces that collection. A registry the items fill from their own bodies is not
an answer: seeds are order-independent, a resumed page never re-runs those
bodies, and a keyed `@for` can reorder rows after they registered.

What would close it: a collection handle — `const options = collection()` in the
widget-scoped factory, bound with `el={options.member}` on the repeated part,
read from a handler as its members in document order, maintained by the same
bookkeeping that already fills `element()` handles and mints their ids. It is
also the prerequisite `idref-attributes.ts` names for putting
`aria-activedescendant` in `IDREF_ATTRIBUTES`, which says in as many words that
the attribute "names one row of a live collection".

**3. A widget-root element honours only its first handler.**

`select.item` is a widget root and already carries `onClick`. Moving the listbox
key rule onto it — which would have let each option answer for itself instead of
being found by a walk — compiled clean and did nothing: twelve rows red, with
`symbol:3` recorded as *running* in the debug log while even its pure-state
branches (`Tab` committing through `select.choose`) had no effect. Reordering the
branches and moving every DOM call out of the handler changed nothing. The key
rule therefore stays on `select.content`, which is where it works. Worth a
separate charter: the failure is silent, and a consumer adding a second handler
to any widget-root part would hit it the same way.

## Keyboard model

Collapsed, on the trigger: `ArrowDown`/`Home` open on the first enabled option,
`ArrowUp`/`End` open on the last, `Enter`/`Space` open through the native click
and land on the first, `Alt+ArrowDown` opens and leaves focus on the combobox,
and a printable character opens on the first option whose text starts with the
buffer. A chosen option always wins over the first/last default, which is QDS's
`getInitialHighlightIndex` rule.

Open, on the listbox: `ArrowDown`/`ArrowUp` move the roving focus one enabled
option and stop at the ends (a select's list has a top and a bottom; unlike a
radio group it does not wrap). `Home`/`End` are absolute moves in the same walk.
A printable character moves the focus. `Enter`/`Space` commit and close and hand
focus back to the trigger. `Escape` closes, leaves the value untouched, and hands
focus back. `Tab` commits and closes and keeps its native move.

**Moving the highlight is never choosing.** That is the rule separating this
family from radio group, where the APG says an arrow always chooses, and it is
the row most likely to be got backwards by whoever writes both families in the
same week. `select.browser.ts` and `select.sr.ts` each carry it, the second as a
negative proof that the word "selected" is *absent* from the announcement.

Commit-by-key goes through the option's own click rule (`option.click()`) rather
than duplicating the value read. That keeps one place in the family where a
value is taken, and it is also why no option carries its value in a DOM
attribute — the owner's ruling forbids `data-*`, and nothing needs it.

Typeahead matches the option's own words with any `aria-hidden` subtree left
out, so an indicator reading "Chosen" is never typeable. QDS's all-same-character
cycling rule (type "a" repeatedly to walk the options starting with "a") is not
carried; research §9 question 4 kept v1 on plain prefix matching.

## Rows this family does not carry

- **A widget-root part inside a flipping `@if` arm is refused** with
  `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`, so "this option appears when a
  checkbox is on" — an everyday form — is a framework wall.
  `optional-option.tsrx` decides its arm from a module constant, the same shape
  otp's `armed-length.tsrx` and tabs' `arm-tabs.tsrx` settled on, and this note
  carries the verdict instead of a red row.
- **`@if` and `@for` cannot be direct children of a component tag**
  (`MARKLESS_PARSE_ERROR`), so both `options-from-data.tsrx` and
  `optional-option.tsrx` wrap their arm in a `<div role="presentation">` inside
  `select.content`. Presentational children are re-parented in the accessibility
  tree, so the listbox still owns its options; the reader rows prove it.

## What the loop proved

Research §9 question 5 called a `select.item` inside a keyed `@for` the
highest-value spike of the tranche, unproven for any family: otp proved a *part*
survives a repeat, but a `select.item` roots its own widget instance, which is
the untested combination. **It works.** `options-from-data.tsrx` renders three
options from data, each gets its own instance, choosing lands in exactly one
row, and the arrow walk moves between them — green in the browser suite with no
pin. That closes the open question the research left for this family.

## The screen-reader lane, and one thing it needs from outside this folder

`select.sr.ts` carries Sequences A–E from research §4c as captured expectations,
plus three rows aria-at's plan has no test for: a disabled option, a whole
disabled select, and the hidden native control staying silent. Every word in it
was read off this reader's own transcript rather than invented — the collapsed
state, for instance, is announced as "not expanded", not "collapsed".

Two honest limits are recorded in the file itself. A reader cannot walk into a
`hidden` listbox, so every row that reads an option needs a scenario handed over
open (`open-list.tsrx`, `long-open-list.tsrx`, and the first select in
`unavailable-options.tsrx`). And aria-at's "13 options" set-size assertion has no
equivalent announcement in a virtual reader, so it is carried as reaching all
thirteen names in authored order.

The five words this family needs — `combobox`, `listbox`, `option`, `selected`,
`notSelected` — are not in `test-support/driver.ts`'s shared `Vocabulary`, which
is outside this unit's file contract. They live in a local table in
`select.sr.ts` with the same verified/unverified marking `vocabularies.ts` uses.
Promoting them into the shared table, so `Conveys` can name them like every
other role, is a follow-up.

**The lane needs `fileParallelism: false`.** Measured three ways on this tip:

| Run | Result |
| --- | --- |
| `select.sr.ts` alone | 10 passed |
| whole lane, parallel, without `src/select/**` | 79 passed, 0 failed |
| whole lane, parallel, with select | 3 failed (pagination, tabs, collapsible) |
| whole lane, `--no-file-parallelism` | 89 passed, 0 failed |

The three reds are in families this unit never touched, they are poll timeouts
at 1.7–2.0s, and they disappear when the lane runs serially. This is the same
effect `packages/headless/components/vitest.config.ts` already pins for the
browser project, in a comment quoting its own measurement (p99 gesture latency
1230ms parallel vs 363ms serial, and serial being *faster* overall). The
screen-reader config never got that line, and the eleventh file is what pushed
the lane over. The fix is one line in
`packages/headless/components/test-support/vitest.config.ts`, which is outside
this unit's contract.

## Not wired into the barrel

`src/index.ts` does not carry `select` yet, and neither does the package's
`exports` map, so the scenarios import `../index.ts` directly. Both are the PM's
to wire at fan-in.
