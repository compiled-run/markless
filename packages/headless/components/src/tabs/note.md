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
It holds nothing but that tab's own `value`, and it exists for one measured
reason (below). It is deliberately **not** in `index.ts`: it is a workaround,
not consumer surface.

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
4. **`aria-orientation` on the list.** QDS emits only `ui-orientation`, which no
   assistive technology reads; the APG requires the ARIA attribute. Emitted in
   both directions rather than only for vertical, matching radio-group.
5. **`{...rest}` is spread first.** QDS spreads `{...props}` last on the trigger
   and the content, after `aria-selected` and `tabIndex`, so a consumer silently
   overwrites the ARIA state. Pinned by `consumer-attributes.tsrx`.
6. **No handler arrays.** QDS composes with `onClick$={[a, b]}`; each handler
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
5. **`event.target`, not `currentTarget`.** A lazy handler symbol runs after the
   native dispatch has finished, and `currentTarget` is null by then.
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

DOM order is the navigation order, so no registry holds it:
`closest('[role="tablist"]').querySelectorAll('[role="tab"]')` from the event's
own target, filtered to the enabled buttons. Home and End are absolute moves in
the same walk. Looping is the root's `loop`, default `false` as in QDS.

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

`src/index.ts` does not carry `tabs` yet, and neither does the package's
`exports` map, so the scenarios import `../index.ts` directly. Both are the PM's
to wire at fan-in.
