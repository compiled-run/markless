# tabs — implementation notes

Research: `goals/headless-components/notes/research-tabs.md`.
QDS source read as structural truth: `~/dev/open-source/qwik-design-system/libs/components/src/tabs/`.

## Shape

Four parts, the QDS folder listing exactly: `tabs.root`, `tabs.list`,
`tabs.trigger`, `tabs.content`. No indicator, no per-tab wrapper — QDS ships
none, and an indicator is a pure-CSS concern in the three libraries that do.

One widget family, `tabsState`, rooted by `tabs.root`: `value`, `orientation`,
`loop`, `selectOnFocus`, the consumer's `onChange`, and `show(next)`. It is
exported as `state` beside the parts, per the owner's namespace ruling.

`tabsPartState` is a second, widget-scoped family rooted by each `tabs.trigger`.
It holds that tab's own `value`, for one measured reason (below), and since
2026-08-23 an `element()` handle, `el`, bound to the tab's button so the key rule
can read its own element instead of selecting for it. It is deliberately **not**
in `index.ts`: it is a workaround, not consumer surface.

## Deviations from QDS, and the constraint that forced each

1. **`value` is required on `tabs.trigger` and `tabs.content`.** QDS makes it
   optional and falls back to a declaration-order index taken from a mutable
   counter on the context object (`context.currTriggerIndex++` inside
   `useConstant`). Markless seeds are order-independent by design and the owner
   ruled out a runtime creation-order counter; the compile-time per-part ordinal
   that would replace it is chartered but has not landed (otp still takes
   `index={n}`). So a tab is named by its value and nothing counts positions.
2. **Omitting `value` on the root shows no tab.** This follows from (1): QDS
   defaults the root to the string `"0"`, which selects the first tab only
   because the index fallback exists. Every scenario here names the tab that
   shows. The day the ordinal capability lands, both this and (1) can go back to
   QDS's shape.
3. **`ui-vertical` presence attribute instead of `ui-orientation="vertical"`.**
   Repo convention (owner ruling 2026-08-18 on attributes); scroll-area and
   radio-group already spell it this way, and CSS reads `[ui-vertical]` either
   way. Only the non-default axis carries a flag, as in radio-group.
4. **`{...rest}` is spread first.** QDS spreads `{...props}` last on the trigger
   and the content, after `aria-selected` and `tabIndex`, so a consumer silently
   overwrites the ARIA state. Pinned by `consumer-attributes.tsrx`.
5. **No handler arrays.** QDS composes with `onClick$={[a, b]}`; each handler
   here is an authored closure that calls the family's rule and then the
   consumer's.

## Trigger ↔ panel pairing is not wired, and cannot be yet

The APG wants `aria-controls` on the tab and `aria-labelledby` on the panel.
Neither is emitted, and neither is emitted by QDS.

`element()` mints one id per handle per widget instance, and a tabs root is
**one** instance holding N trigger/panel pairs, so a handle written in an IDREF
position names one element rather than the third of four. The ways around it are
refused by name: `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` (no list or choice in
an IDREF position), `MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED` (no handle bound
inside a keyed repeat), `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` (the root may
not read its own factory's handle there). Collapsible wires exactly this pairing
because it has one pair; tabs has N.

The single-pair shape the IDREF capability *can* express was tried and refused,
on this tip, on 2026-08-22. One widget-scoped handle is one element per rendered
widget, so the showing tab is the only tab that may carry it:

```tsx
<button role="tab" …>
	@if (selected) { <span el={tabs.showingTabEl}>{children}</span> }
	@else { <span>{children}</span> }
</button>
…
<div role="tabpanel" aria-labelledby={tabs.showingTabEl} …>
```

That is `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`: "this `@if (selected)` cannot be
rebuilt when `selected` changes because it holds a attribute binding." Binding the
handle on the button itself instead compiles, and is worse: every trigger in the
widget renders the same minted id, so three tabs carry three copies of one id and
every panel resolves to the first of them — the exact ambiguity
`MARKLESS_ELEMENT_HANDLE_DUPLICATE` refuses when it is spelled twice in source.
`el={…}` takes a bare handle, so there is no third spelling that binds only the
showing tab.

What would satisfy it is a widget-scoped instance **keyed by the authored value**
that two parts in different subtrees both resolve — `shared()` takes only
`scope`, so there is no key today. Research §6b states the full requirement.
`tabs.browser.ts` asserts both attributes absent, so that row turns red the day
the capability lands.

Until then a consumer can name a panel itself: `{...rest}` is spread first and the
family writes no `aria-label` on `tabs.content`, so
`<tabs.content value="overview" aria-label="Overview">` reaches a reader named.
The family cannot do it for them, because only the consumer knows the tab's text.

## What the compiler forced

Everything below is measured on this tip, not assumed.

1. **A panel goes stale after resume.** Pinned `test.fails`:
   `SSR: clicking a tab moves the panels`. A `tabs.content` renders correctly
   from the served HTML and then never refreshes again — `ui-selected` stays
   absent and `hidden` stays set — while the triggers beside it, in the same
   widget, move correctly. It is the computed cell that is stale, not one
   attribute: `ui-selected` and `hidden` read the same cell and both are wrong.
   Every CSR equivalent is green.
2. **The trigger needed its value as a cell, the panel did not tolerate one.**
   Written the way research §7 sketches it — every part comparing
   `tabs.value === value`, its own prop — the trigger's `aria-selected` and
   `tabindex` also went stale after resume (4 red rows). Seeding the trigger's
   value into `tabsPartState` and comparing two cells fixed the trigger in both
   modes. Doing the same in `tabs.content` made things **worse**: `hidden`
   then stopped refreshing in CSR as well (10 red rows). So the panel ships
   comparing against its prop, the trigger ships comparing against a cell, and
   the asymmetry is a measurement rather than a preference.
3. **One graph cell per read position.** Each part derives a single
   `computed()` and reads it for `aria-selected`, `tabindex`, `hidden` and
   `ui-selected` alike. Radio-group measured that an inline conditional
   `tabindex` destabilises the first gesture (3 red runs of 4 with it inline,
   3 green of 3 hoisted); the same hoist is kept here.
4. **`preventDefault()` is guarded by a plain six-key comparison on
   `event.key`.** A guard written over locals derived from graph state is
   `MARKLESS_SYNC_POLICY_UNEXTRACTABLE`; the orientation gate therefore lives in
   a second, non-preventing branch — the same split QDS reaches through `sync$`.
5. **`currentTarget` is null in a lazy handler.** A handler symbol runs after
   the native dispatch has finished. Until 2026-08-23 that left `event.target`
   as the trigger's only route to its own button; the key rule now reads
   `tab.el`, the handle that same button binds (below). The fact still holds for
   any handler that needs the node an event actually landed on.
6. **`@if` cannot be a direct child of a component tag.** `@if` written straight
   inside `<tabs.root>` or `<tabs.list>` is `MARKLESS_PARSE_ERROR` ("Expected
   '</' to close the JSX element, but found '@'"); an arm needs an intrinsic
   element around it. That rules out a conditionally offered **tab**, because the
   only wrapper available inside `<tabs.list>` would sit between `role="tablist"`
   and its tabs and break the list's ownership of them. `arm-tabs.tsrx` therefore
   arms a panel, not a tab, and the condition is a module constant because a
   flipping arm holding a shared-instance part is refused
   (`MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`).

## Navigation

DOM order is the navigation order. The tab the walk starts from is no longer
found by selector: the trigger binds `el={tab.el}`, a handle declared in the
`tabsPartState` factory, and its key rule reads that handle back. From there the
ordered set is still `here.closest('[role="tablist"]')
.querySelectorAll('[role="tab"]')`, filtered to the enabled buttons. Home and End
are absolute moves in the same walk. Looping is the root's `loop`, default
`false` as in QDS.

The collection half is the shape the owner's 2026-08-24 no-DOM-selectors order
bans, and it is still here because the replacement is not expressible on this
tip — and because the ordered-collection surface is an open owner decision, so
this unit was told not to convert it. What was measured is the section below.

## Why the roving walk still traverses the DOM

Two independent capabilities were missing when this family was written. One
closed on 2026-08-23; the other is now the only wall.

**1. An `element()` handle does not resolve inside a lazy event handler. —
CLOSED 2026-08-23 (defect 54, and defect 63 behind it).**

*Converted here on 2026-08-23: `tabsPartState` declares
`const el = element<HTMLButtonElement>()`, the trigger binds `el={tab.el}`, and
that button's own `onKeydown` reads `const here = tab.el` where it used to write
`(event.target as HTMLElement).closest('[role="tab"]')`. The browser suite is 44
passed / 1 expected fail and the reader suite 7 passed / 1 expected fail, both
identical to the counts measured on the same tip before the conversion — and the
arrow, Home and End rows only pass at all if the handle resolves, because the
handler returns early when it does not. The history below is kept because two
separate landings were needed and the second was not where the first looked.*

The original wall: `specs/framework/04-events-symbols-behaviors.md` documents the
supported shape — `<input el={input} />` beside `onClick={() => input?.focus()}`
— and `07-diagnostics.md:68` repeats it ("Use element() plus el={...}, then read
the element handle inside the handler"), yet a handle declared in the component
body and bound `el={here}` on the very button the handler sits on read
`undefined` inside that button's own `onKeydown`, in **both** modes, silently.
The same read through a shared instance (`tab.el`, declared in the
`tabsPartState` factory and returned from it, which `03-state-graph.md:712`
sanctions) was `undefined` in CSR too. otp measured the shared-instance form
undefined after resume (otp/note.md); this family extended it to the
component-local form and to CSR.

Two landings closed it, both on this branch. `element() handles resolve as values
in handlers` (commit `1d8777e9`, defect 54, witnessed by
`packages/compiler/test/element-handle-values.test.ts`) made the read compile and
emit `context.getElementHandle(...)` for shared members, call arguments and
cross-element reads. That alone was not enough: a widget-scoped handle id is one
module-level string, so the read answered for whichever widget registered last.
Defect 63 fixed that in two halves — `a8eaf144` qualifies a widget-scoped handle
id with the rendered widget's root path, and `0de21164` gives the **bound**
symbol dispatch path the same scoping the graph already had. The second half is
what this family needed: the trigger forwards a consumer callback
(`onKeydown?.(event)`), so its handler is a bound symbol, and a bound symbol's id
names only its component edge. `packages/vitest-browser/browser/handle-instance.test.ts`
pins both.

Each `tabs.trigger` roots its own `tabsPartState` instance, so `tab.el` is one
element per instance rather than one per widget — the ambiguity
`MARKLESS_ELEMENT_HANDLE_DUPLICATE` refuses, and the reason a handle on
`tabsState` still could not name a single tab (see the pairing section above).

**Defects 57 and 58 do not reproduce here either.** Both were re-measured on
2026-08-23 and returned non-reproducing (headless-pilot board, unit
`U211-widget-root-handler-wake`): a widget-root element runs both its handlers,
and a nested widget-rooting element's handler wakes and runs, at two nesting
depths, in CSR and after resume. This family is standing evidence for the first
of the two — `tabs.trigger` is a widget-root element carrying three handlers
(`onClick`, `onFocus`, `onKeydown`), and the suite exercises all three. What that
unit did reproduce is narrower: only the innermost element on a bubble path is
resumed, so an **enclosing** element's same-event handler is dropped. No part of
this family is exposed to it, because `tabs.root` and `tabs.list` write no
handlers of their own; a consumer who spreads one onto `tabs.list` would be, and
that follows from the unit's reproduction rather than from a measurement here.

**2. A widget root cannot collect an ordered registry of its parts. — still
open, and now the only wall.** Even with handles, the walk needs the enabled tabs
in authored order, which only the set of rendered triggers knows. Both spellings
failed when measured on commit c4edc6d9, and neither has been re-measured since:

- a part body writing into the root's instance
  (`tabs.walk = [...tabs.walk, value]`) is refused at compile time with
  `MARKLESS_SHARED_SEED_UNSUPPORTED`: "a component body seeds a shared instance
  only from its own props or from constants";
- the same write routed through a parameterised method on the root instance
  (`tabs.enlist(tab)`, with `enlist` pushing onto a cell in the factory)
  **compiles clean and silently does nothing**. The cell is reachable from the
  handler — it reads as an `object` — and it is empty. Measured with an array of
  part instances, with an array of plain strings, and with a scalar string
  accumulator: all three arrive at the handler empty. No diagnostic is emitted
  for the no-op, which is itself a fail-closed gap. `handler callbacks route
  shared-instance writes` (commit `7d009f8f`, defect 66) has landed since, and
  may well have changed this outcome; it was deliberately not re-tried on
  2026-08-23, because the ordered-collection surface is an open owner decision
  and this unit was scoped out of touching the walk.

QDS reaches the same registry through a Qwik context array its items push into at
render; that is the mechanism markless has no equivalent for. The capability the
owner's order points at ("a roving walk over a collection of items") was two
requests. The first — a handle that resolves in a lazy handler, per instance —
landed on 2026-08-23 and is used here. What is left is a per-widget ordered part
registry, or the chartered per-part ordinal, which would answer it by giving each
trigger its position and the root its count.

`attach` is not a third route: a behavior's inputs may not carry DOM nodes, and
`04-events-symbols-behaviors.md:113` states that resume startup records behavior
metadata without running the behavior code, so a registry built that way is not
populated before the first arrow key.

Unlike a radio group, an arrow key moves focus only. Whether focus also shows
the tab is `selectOnFocus`'s call, made once in the trigger's `onFocus` and
defaulting to `true` — QDS's default, and the majority of the surveyed
libraries. With it off, Enter and Space show the focused tab through the native
button click, so the family needs no key rule for them.

## Panels stay mounted

`hidden` decides whether a panel shows; an arm never does. A panel that unmounts
loses the focus, scroll position and form state inside it on every tab change,
and it is what QDS does. The showing panel is a tab stop (`tabindex="0"`), the
hidden ones are not, which is what makes Tab out of the tablist land on the
panel.

## Not wired into the barrel

The family is wired into src/index.ts (root barrel; per-family subpaths removed per the one-surface ruling).
`exports` map, so the scenarios import `../index.ts` directly. Both are the PM's
to wire at fan-in.
