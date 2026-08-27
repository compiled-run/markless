# toolbar — implementation notes

A bar of controls that keep their own roles and share one tab stop: three toggle
buttons, a switch, a select and a plain button, reachable with one Tab and then
the arrows. Built from
`goals/headless-components/notes/U651-menubar-toolbar-research.md`.

The family exists because of a framework fact that landed first
(`U656-enclosing-registration.md`): a part of family A, even one rooting its own
widget, that reads family B's enclosing `state()` resolves B's instance, and its
`element()` registration lands in that instance's roster. That is what lets a
`toggle` or a `select` join a bar with no wrapper part in between — the thing
U651 said a toolbar could not be built without.

## Shape

| Part | Element | Carries |
| --- | --- | --- |
| `toolbar.root` | `div` | the family's state; renders one private component a level down that owns `role="toolbar"`, `aria-orientation`, `aria-labelledby`, the bar's own tab stop, `ui-vertical`, and the whole keyboard |
| `toolbar.label` | `span` | the bar's accessible name |
| `toolbar.item` | `button` | a plain button belonging to no other family: `type="button"`, `aria-disabled`, `ui-disabled`, and its registration |

`toolbar.state()` per widget instance: `orientation`, `mounted`, `active`,
`entered`, and the `barEl` / `labelEl` / `itemEls` handles. `toolbar.itemstate()`
per item: `disabled`, and the item's own `el`.

Root props: `orientation`. Item props: `disabled`. There is no `value`, no
`onChange` and no callback of any kind: a bar reports nothing, because every
control in it already reports for itself.

`ui-vertical` on a stacked bar and every part of it; `ui-disabled` on an
unavailable item. Only the non-default axis carries a flag, the ruling `tabs`,
`carousel` and `togglegroup` already follow. `aria-orientation` is written out in
both directions, because unlike `role="group"` the toolbar role does support it.

No `<style>` block: nothing in a toolbar is positioned, hidden or stacked, so the
family ships no CSS defaults at all and layout is entirely the consumer's.

## Mixing in another family's control

A control registers itself. It reads the enclosing `toolbar.state()` and binds
the bar's plural handle alongside its own:

```tsx
const toolbar = toolbarState();
const stop = computed(() => (toolbar.mounted === true ? -1 : undefined));

<button el={[select.triggerEl, toolbar.itemEls]} tabindex={stop} …>
```

Three controls ship wired this way: `toggle.trigger`, `togglegroup.item` (each
item is its own stop) and `select.trigger`. `menu.trigger` is **not** wired yet —
see the follow-up below.

`toggle` registers at the **trigger**, not at `toggle.root` as the direction
spelled it, for a reason the roster forces: a toolbar's roster holds elements the
bar calls `focus()` on, and `toggle.root` renders a `div`. The trigger is the
switch's focusable element, and it is a part of the toggle family and a part of
the enclosing toolbar at the same time.

**Outside a bar, nothing changes.** A control that stands outside every toolbar
resolves to no toolbar instance, so it registers in no bar's roster and reads
`mounted` as the seed — `false` — and renders the tabindex it always had. That is
measured from both ends: `two-bars.tsrx` puts a loose switch beside two bars and
asserts the arrows never reach it and its `tabindex` attribute is absent, and all
147 existing rows of `toggle`, `togglegroup` and `select` stayed green under the
registration edits.

## The bar owns the roving tabindex, because nothing else can

The first design had each control render its own stop by comparing itself to the
roster. The compiler refuses it outright:

> `MARKLESS_ELEMENT_HANDLE_UNBOUND`: element() handles are DOM-bound and readable
> only in event handlers, so "el" is undefined on every derivation.

So no part can ask "am I the first control in this bar?" at render time — not
`toolbar.item`, and certainly not a foreign control. The stop is therefore
written by the bar, onto the roster elements, from the bar's own handlers
(`applyStops` in `toolbar-walk.ts`). Setting `tabIndex` on elements the family
already holds handles for is a write, not a lookup, so nothing here queries the
DOM.

That leaves the cold page, before any handler has run, with no control able to
carry the stop. **The bar carries it itself**: `toolbar.root` renders
`tabindex="0"` while `entered` is false, every registered control renders `-1`,
and the first `focusin` on the bar hands focus straight to the control holding
`active` and drops the bar out of the tab order for good. One tab stop cold, one
tab stop warm, and no frame polling anywhere.

The cost, stated plainly: arriving backwards with Shift+Tab lands on the bar,
which forwards to the control holding the stop rather than to the last control.
After the first entry the bar is `-1` and Shift+Tab from below returns to the
remembered control, which is the behaviour a person actually meets.

## How two keyboards compose, with no cooperation

Both handlers run: the control's, and then the bar's as the key bubbles. The bar
decides whether the key was already spent by asking whether focus moved:

```ts
const from = event.target;
const landed = document.activeElement;
if (landed !== from) { /* the control took it; only record where the stop is */ }
```

Nothing is flagged, nothing calls `stopPropagation`, and no control had to be
told it is in a toolbar. Three cases fall out of it, all measured:

- **A select's ArrowDown** opens its listbox and moves focus, so the bar records
  and stands down. In a horizontal bar it was never the bar's key anyway.
- **A toggle group's interior ArrowRight** steps to the next item in the group,
  which is also the next stop in the bar, so the two answers coincide.
- **A toggle group's ArrowRight on its last item** returns that same item — the
  group does not loop — so focus does not move, the bar takes the key, and focus
  leaves the group. The edge of a nested walk becomes the bar's step for free.

`document.activeElement` and `event.target` are nodes the platform hands over,
which SPEC's DOM-access section names explicitly; neither finds anything.

Two consequences worth knowing before writing a bar:

**A control that needs the bar's own arrow pair takes it.** In a *vertical* bar a
select's ArrowDown opens the select and the bar does not move. This is exactly
the APG's caution — "avoid including controls whose operation requires the pair
of arrow keys used for toolbar navigation; if unavoidable, include only one and
make it the last element" — and `scenarios/vertical.tsrx` is that arrangement,
with a pinned row asserting what happens.

**Home and End inside a toggle group reach the group's ends first.** The group
handles them and moves focus, so the bar records rather than jumping to the bar's
ends; a second Home, pressed where focus no longer moves, reaches the bar's first
control. Two presses instead of one, and the alternative would be asking the
group to know it is in a bar.

## Disabled: two kinds, and the bar treats them differently

Every disabled control stays in the roster — the APG's rule, so a person walking
the bar knows the control is there. What differs is whether an arrow may land on
it, and the family reads that off the platform rather than off a convention:

- `toolbar.item disabled` writes `aria-disabled="true"` and `ui-disabled`, keeps
  the native attribute off, and stays focusable. An arrow lands on it, a reader
  announces it, and the family refuses the activation.
- A control the browser has taken out of the tab order — a `toggle.trigger` whose
  family disabled it natively — cannot take focus at all, so landing on it would
  swallow the key. The walk goes past it.

The predicate is `element.disabled !== true`, which is the fact itself rather
than a guess about it.

## Roster order

The roster is a plural `element()` handle, so it reads back in registration
order, and a control of another family binds it from that family's own component.
`orderedRoster` sorts it with `compareDocumentPosition` on the registered handles
— a predicate over elements the family already holds — so the walk is document
order regardless of how the page was assembled.

## What v1 refuses

No `loop`. The APG calls arrow wrapping optional for this pattern, and `tabs` and
`togglegroup` both default it off; a bar that wraps would also hide the "you are
at the end" feedback that makes Tab-out discoverable.

No `separator` or `group` part. `menu/note.md` already ruled that separators and
groups are the consumer's markup, and SPEC lists `group` as below the three-use
bar; both are `<div role="…">` the consumer writes.

No `value`, no `onChange`, no `disabled` on the root. A bar is a grouping and a
tab-stop policy; it holds no state a consumer would bind, and disabling every
control from the bar would mean writing to families the bar does not own.

No `aria-activedescendant` — deliberately absent from the compiler's IDREF
attributes, so roving DOM focus is the only model here. No `asChild`, no
placement props, no RTL `dir`.

## Follow-ups this unit names rather than does

**`menu.trigger` registration.** A menu inside a toolbar renders and works today,
but its trigger is not a bar stop: it is not in the roster, the arrows do not
reach it, and it keeps its own tab stop. `scenarios/mixed.tsrx` deliberately does
not contain one. The wiring is three lines in `menu.tsrx` — the same three every
other control took — and it is held because a menubar branch is contending that
file.

**A `toolbar` slot in `test-support/driver.ts`'s `Vocabulary`.** The virtual
reader announces "toolbar" and `toolbar.sr.ts` asserts it from a local word table,
the way `togglegroup.sr.ts` does for `pressed`. The real-reader transcript cannot
assert the role word at all, because `Conveys.role` is keyed by `Vocabulary` and
there is no slot; it asserts the bar's name instead.

**Registration, gallery and CI.** `toolbar` is not exported from `src/index.ts`,
so its scenarios import the family directly. `toolbar-transcript.ts` spells its
own gallery anchor rather than reading `FAMILY_ANCHORS`. The two real-reader
lanes are written and have never been run.

## Qwik UI and reference mapping

There is no Qwik UI toolbar. The references are the APG pattern, Radix Toolbar,
Base UI Toolbar and React Aria Toolbar (Kobalte, Ark/Zag and Headless UI ship
none), surveyed in U651.

| Reference | Here | Why |
| --- | --- | --- |
| `orientation`, `role="toolbar"`, `aria-orientation`, roving tabindex, Home/End | kept | the pattern everyone agrees on |
| Radix `Toolbar.Button` / `.ToggleGroup` / `.Link` / `.Separator` wrapper parts | dropped | the controls are other families' already; a wrapper `div` cannot carry a stop and would be a second, roleless one |
| Base UI `Toolbar.Group`, everyone's `Separator` | dropped | consumer markup, per `menu/note.md` |
| `asChild` / `render` prop-merging | dropped | no such mechanism, and `togglegroup/note.md` refuses `asChild` by name |
| React Aria's DOM subtree walk for the roster | the plural `element()` handle, registered by each control | SPEC bans selectors and walks in family source |
| `loop` (Radix defaults it on) | dropped | `tabs` and `togglegroup` default it off |
| `dir` / RTL | dropped | no locale source in the dependency graph |
| `data-*` identity attributes | dropped | `ui-*` state only |
