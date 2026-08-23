# Select — component research for `@markless/ui`

**Research date:** 2026-08-23
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `fc66d3f9`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/select/` (READ-ONLY)
**Cluster note:** select is one of the two **closure-state pattern families**. Read
`research-class-state.md` alongside this; §6 here is the part that memo was written for.

---

## 1. Name and alternates

Searched under: select, listbox, dropdown, combobox, picker, autocomplete, single-select,
multi-select, option list.

- **Select** is the name in Base UI, Ark UI, Radix, Kobalte, Bits UI, Melt, Headless UI (as
  `Listbox`), React Aria (as `Select`) and QDS. Universal.
- **Combobox** is a *different* family in every one of those libraries: it has a text input the
  person types into, and the popup filters. This family does not. The APG name for what we are
  building is the **select-only combobox** — a `role="combobox"` element that is not a text field.
  That distinction is the single most consequential naming fact in this document, because it decides
  which ARIA pattern the trigger follows (§4).
- **Listbox** is the name for the *popup*, not the family. Headless UI calls the whole thing
  `Listbox`, which is the outlier.
- **Dropdown menu** is a different family again (`role="menu"`, actions not values). Anything that
  commits a value belongs here; anything that runs a command belongs in a menu family we have not
  chartered.

**Alternative-named implementations.** Nothing found under an alternate name carries a pattern the
tier-1 libraries lack. The nearest interesting case is Downshift, which is a hook rather than a
part set and exposes `useSelect` separately from `useCombobox` — the same split the APG makes.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
select-content.tsx          select-item.tsx            select-root.tsx
select-field.tsx            select-item-indicator.tsx  select-trigger.tsx
select-item-label.tsx       select-label.tsx           select-utils.ts
index.ts   select.css   select.browser.tsx   select-value-test.tsx
```

`index.ts`, and the namespace name at the repo root:

```ts
export { SelectContent       as content }       from "./select-content";
export { SelectField         as field }         from "./select-field";
export { SelectItem          as item }          from "./select-item";
export { SelectItemLabel     as itemlabel }     from "./select-item-label";
export { SelectLabel         as label }         from "./select-label";
export { SelectRoot          as root }          from "./select-root";
export { SelectTrigger       as trigger }       from "./select-trigger";
export { SelectItemIndicator as itemindicator } from "./select-item-indicator";
```

**Eight parts.** Same all-lowercase compound spelling as radio group (`select.itemlabel`, not
`select.item-label`), forced because a JSX member tag cannot carry a hyphen.

`index.ts` also exports four *context getters* — `getIsOpen`, `getSelectedLabels`,
`getSelectedValues`, `getHighlightedIndex` — built from a `createContextProxy`. Those are QDS's
answer to "how does a consumer read the widget's state from outside a part". Markless answers the
same question with the `state` alias every landed family already exports
(`packages/headless/components/src/tabs/index.ts`: `tabsState as state`), so the getters do **not**
become parts.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | composes `PopoverRoot`; writes `ui-qds-select-root`; provides `SelectContext`; renders no role of its own |
| Root props | `multiple`, `onChange$`, `onOpenChange$`, `displayValue`, plus `bind:value` / `bind:open` / `bind:disabled` |
| Trigger | composes `PopoverTrigger`; `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls={localId}-content`, `aria-labelledby="{label} {trigger}"`, `disabled` |
| Content | composes `PopoverContent`; `role="listbox"`, `id`, `aria-labelledby={localId}-label`; owns the whole keyboard model |
| Item | `role="option"`, `aria-selected`, `aria-disabled`, `tabIndex={isHighlighted ? 0 : -1}`, `ui-selected`, `ui-highlighted`, `ui-disabled` |
| Item identity | `value ?? String(index)` where `index` is a construction-order counter `context.currItemIndex++` inside `useConstant`, then `registerItem(...)` pushes ref/value/disabled into three parallel signal arrays |
| Field | a `VisuallyHidden` real `<select aria-hidden="true" tabindex="-1">` rebuilt from `itemValues`, carrying `name`, `required`, `multiple`, `disabled` |
| Label / itemlabel | mint `${localId}-label`; `itemlabel` writes the item's text into `itemLabelText` for typeahead |
| Focus model | **roving DOM focus onto the option itself**, not `aria-activedescendant` |
| Keyboard, closed trigger | printable → typeahead select-in-place; `Enter`/`Space`/`ArrowDown`/`ArrowUp` → open and compute an initial highlight |
| Keyboard, open content | printable → typeahead move; `ArrowDown`/`ArrowUp` → next/prev enabled; `Home`/`End` → first/last enabled; `Enter`/`Space` → commit (toggle when `multiple`); `Escape`/`Tab` → close |
| Closure state | `SelectNavigation` and `SelectTypeahead`, built through `useSerializer$` with no `serialize`, so nothing crosses the wire (`research-class-state.md` §1.3) |

`select.browser.tsx` carries 49 tests. That is the behaviour contract to port.

### Things to fix rather than copy

1. **The trigger is missing `role="combobox"`.** It carries `aria-haspopup="listbox"` and
   `aria-expanded` on a plain `<button>`. The APG select-only pattern puts `role="combobox"` on the
   element that keeps focus (§4). Without it a reader announces "button, collapsed" rather than
   "combobox". Two of the aria-at select-only assertions (`Role 'combobox' is conveyed`) fail on
   this shape.
2. **`aria-labelledby` on the trigger is a two-id list that always includes a label id that may not
   exist.** Same dangling-IDREF defect radio group has (`research-radio-group.md` §2), and the same
   fix applies.
3. **`aria-controls` points at the content id unconditionally**, including while the popup is
   closed and (in the never-unmount design) still present but hidden. That is fine; noted only so it
   is not "fixed" by accident.
4. **Item identity from a construction-order counter.** `value ?? String(index)` is order-dependent,
   and Markless seeds are order-independent by design. Same ruling as tabs, radio group and otp:
   **`value` is required on `select.item`.**
5. **`displayValue` exists to paper over a render-order problem.** The root cannot know an item's
   label text until the item has rendered, so a preselected value shows its raw value until the
   popup mounts, and QDS dev-warns telling the consumer to pass `displayValue`. Our seed phase runs
   before render and can carry the item's label as a seed, so this prop should not be needed —
   **but that is a claim to test, not to assume** (§8).
6. **`select.field` rebuilds a whole `<select>` with an `<option>` per value, labelled by the
   *value* not the label.** Screen readers ignore it (`aria-hidden="true"`), so it is form-post
   plumbing only. Correct, but it means the family carries a second copy of the option list.

---

## 3. Headless library survey

Read 2026-08-23 unless stated.

| Library | Parts | Focus model | Popup mechanism |
| --- | --- | --- | --- |
| **Base UI** | `Root, Label, Trigger, Value, Icon, Portal, Backdrop, Positioner, Popup, List, Arrow, Item, ItemText, ItemIndicator, Group, GroupLabel, Separator, ScrollUpArrow, ScrollDownArrow` | highlight + typeahead | **Portal to `<body>`**, not the native popover attribute |
| **Ark UI** | `Root, Label, Control, Trigger, ValueText, Indicator, Positioner, Content, ItemGroup, ItemGroupLabel, Item, ItemText, ItemIndicator, HiddenSelect, ClearTrigger` | `aria-activedescendant` (Zag machine) | portal + floating-ui |
| **Radix** | `Root, Trigger, Value, Icon, Portal, Content, Viewport, Item, ItemText, ItemIndicator, Group, Label, Separator, ScrollUpButton, ScrollDownButton` | roving DOM focus | portal |
| **React Aria** | `Select, Label, Button, SelectValue, Popover, ListBox, ListBoxItem` | `aria-activedescendant` on the button | portal |
| **Kobalte** | `Root, Label, Trigger, Value, Icon, Portal, Content, Listbox, Item, ItemLabel, ItemIndicator, HiddenSelect` | roving | portal |
| **Bits UI** | `Root, Trigger, Portal, Content, Item, Group, GroupHeading, ScrollUpButton, ScrollDownButton, Viewport` | roving | portal |
| **QDS** | 8 parts (§2) | roving DOM focus | **native `popover`** via its own popover family |

What is universal, which is what matters for our API:

| Decision | Universal? | Detail |
| --- | --- | --- |
| Root / Trigger / Content(listbox) / Item decomposition | 7/7 | forced by the pattern |
| A hidden native form control | 6/7 | Base UI, Ark (`HiddenSelect`), Kobalte (`HiddenSelect`), Radix, Bits, QDS (`field`). React Aria makes the button itself the control |
| `value` on the item | 7/7 | string in six of seven; Base UI allows arbitrary values with `isItemEqualToValue` |
| Typeahead with a reset window | 7/7 | 500–1000 ms; QDS uses 750 ms |
| Disabled items skipped by arrow navigation | 7/7 | |
| `multiple` | 6/7 | Bits splits it into a separate `type="multiple"` prop |
| Presence-style state attributes | growing | Base UI ships `data-highlighted`, `data-selected`, `data-disabled` as presence attributes, matching our `ui-*` convention |
| **Portal for the popup** | 6/7 | **only QDS uses the platform.** Every React library ships a `Portal` part because React has no top-layer story of its own |

That last row is the survey's headline. The six portal-based libraries are working around a missing
platform API; the popover attribute plus CSS anchor positioning is what QDS uses instead, and the
overlay memo in `research-popover.md` §7 already recorded the price of that stance (§7.4 there:
no `side`/`align` props, no computed `Arrow`, mandatory `@oddbird` polyfill below Safari 26).
Select inherits that decision wholesale; it does not re-open it.

---

## 4. WAI-ARIA, aria-at, and expected screen-reader behaviour

### 4a. The APG select-only combobox pattern

Read `w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/`, 2026-08-23.

Roles and attributes:

| Element | Carries |
| --- | --- |
| the thing that keeps focus | `role="combobox"`, `aria-labelledby`, `aria-controls={popup}`, `aria-expanded`, `aria-activedescendant={option}` |
| the popup | `role="listbox"` |
| each option | `role="option"`, `aria-selected="true"` on the selected one |

Keyboard, **collapsed**:

| Key | Behaviour |
| --- | --- |
| `ArrowDown` | opens the listbox; focus stays on the combobox |
| `Alt+ArrowDown` | opens the listbox without moving visual focus |
| `ArrowUp` | opens the listbox, visual focus to the first option |
| `Enter`, `Space` | open the listbox |
| `Home`, `End` | open, visual focus to first / last |
| printable characters | open, visual focus to the first match |

Keyboard, **expanded**:

| Key | Behaviour |
| --- | --- |
| `Enter`, `Space` | set the value, close |
| `Tab` | set the value, close, move on |
| `Escape` | close **without** changing the value |
| `ArrowDown` / `ArrowUp` | move visual focus |
| `Home`, `End`, `PageUp`, `PageDown` | move visual focus within the list |
| printable characters | typeahead move |

**The APG example uses `aria-activedescendant`, not roving DOM focus.** QDS uses roving DOM focus
and moves `.focus()` onto the option. Both are legitimate — the APG ships an activedescendant
variant for radio group too, and aria-at maintains *both* radiogroup plans — but they announce
differently, and the choice must be made once (§9 question 1).

### 4b. aria-at coverage — present, and what it covers

`w3c/aria-at`, `tests/apg/`, directory listing read 2026-08-23. **`combobox-select-only` is
present** — one of 40 plans. Its `data/` folder holds `commands.csv`, `references.csv`, `tests.csv`
and a `js/` folder; unlike the radiogroup plans it carries **no `assertions.csv`**, so the
assertions live inline in `tests.csv`. That is an older plan layout, and it means the priority
markers this document can quote are coarser than the ones `research-radio-group.md` §4 quotes.

From `tests.csv`, the plan's 38 tests group as:

| Tests | Task |
| --- | --- |
| 1–6 | navigate forwards / backwards into the collapsed combobox, in reading and interaction mode, plus two VoiceOver-specific rows |
| 7–9 | read information about the collapsed combobox |
| 10–12 | open the listbox |
| 15–16 | open to a specific option by typing a character |
| 19–20 | read information about the open listbox |
| 21–34 | navigate within the popup, single option and ten-option jumps |
| 35–36 | select an option and collapse |
| 37–38 | close the popup without selecting |

Assertions it verifies include `Role 'combobox' is conveyed`, `Name 'Favorite Fruit' is conveyed`,
the position of the focused option, and **the number of options in the popup (13)**.

### 4c. Expected announcements, derived from those assertions

The aria-at reference is a 13-fruit list named "Favorite Fruit". Sequences use those names so a
future transcript test diffs against aria-at directly.

**Sequence A — Tab into the collapsed combobox**

1. keypress `Tab`
2. → "Favorite Fruit"
3. → "combobox"
4. → the currently selected option's text, or nothing when none is selected
5. → "collapsed"

Step 3 is the row QDS fails: with no `role="combobox"` a reader says "button".

**Sequence B — `ArrowDown` opens the listbox**

1. keypress `ArrowDown`
2. → "expanded"
3. → "listbox"
4. → "13 items" — the set-size assertion, and the one that catches a broken option count
5. → the first (or previously selected) option's name → "1 of 13"

**Sequence C — `ArrowDown` inside the open listbox**

1. → the next option's name
2. → "2 of 13"
3. → **no** "selected". Unlike a radio group, moving does not choose. If a reader says "selected"
   here, our arrow handler is committing on move, which is the select family's most common bug.

**Sequence D — `Enter` commits**

1. → "collapsed"
2. → the chosen option's text, announced from the combobox's new value

**Sequence E — `Escape` closes**

1. → "collapsed"
2. → the *original* value, unchanged. A row worth writing precisely because the natural
   implementation ("close on Escape") is easy to write in a way that also commits the highlight.

**Not covered by aria-at, so ours to specify and test without a reference:** multi-select
announcements, a disabled option (we skip it, so it is never announced), a whole disabled select,
and the hidden native `<select>` never being reached (it is `aria-hidden` plus `tabindex="-1"`, so
the correct expected result is *silence*).

**NVDA vs VoiceOver.** The plan carries two VoiceOver-only navigation rows (tests 5–6) because the
VO cursor reaches a collapsed combobox differently from NVDA's browse-mode quick keys, and NVDA
switches to focus mode on entry. A transcript test should assert *that a mode or boundary change
was conveyed*, never the exact words.

---

## 5. GitHub patterns (grep MCP)

- `aria-activedescendant` (TSX) is overwhelmingly used by **typeahead and autocomplete surfaces
  where DOM focus must stay in a text field**: `outline`'s `SuggestionsMenu.tsx` and `sim`'s
  `suggestion-list.tsx` both carry comments saying exactly that ("focus stays in the editor's
  contenteditable while the user arrows the menu"). Fluent UI's `TagPicker.cy.tsx` asserts
  `aria-activedescendant` moves on `ArrowDown`/`ArrowUp`. **Nobody in the sample uses it for a
  select-only surface where the popup can hold focus.** That is real evidence for the roving-focus
  choice QDS made, against the APG example.
- `grafana`'s `VirtualizedList.tsx` carries the anti-pattern's antidote in a comment: *"Clean up so
  `aria-activedescendant` never references a removed option"*. A dangling activedescendant is the
  activedescendant model's version of the dangling-IDREF bug in §2.2.
- `popover="auto"` (TSX) shows the platform route is in production use — `mitmproxy`,
  `refined-github` (with `<anchored-position>`), `remix-run/remix`'s primary nav — and Fluent UI's
  headless preview package documents its two failure modes at length (see §7).
- `facebook/astryx`'s `BaseTypeahead.tsx` carries a landmine we will hit: *"With `popover="auto"`,
  showing the popover between pointerdown and pointerup/click causes the browser's light-dismiss to
  immediately close it (the click is seen as 'outside' the newly-opened popover)."* Its fix is to
  defer `showPopover()` past the active click. Any select trigger that opens on `pointerdown`
  instead of `click` will reproduce this.

---

## 6. Closure state — what select actually needs, measured against what landed

`research-class-state.md` §1.1–1.4 established that QDS puts two classes here: `SelectNavigation`
(five memo fields over four input arrays: `enabledIndices`, `valueToIndex`, `labelToIndex`,
`lowerCaseValues`, `lowerCaseLabels`) and `SelectTypeahead` (a `searchStr` plus a 750 ms `timeout`
handle). Since that memo, three things landed on this branch and change the answer.

### 6a. The three fail-closed diagnostics — commit `7df9f103`

`packages/compiler/src/passes/capture-analysis.ts` now exports:

- `MARKLESS_SHARED_FACTORY_CLASS_INSTANCE` — `shared(() => new Nav(...))` is refused, and the
  suggestion names the rewrite ("plain object"). Test: *"a shared() factory returning a class
  instance is refused"*, `packages/compiler/test/class-state-bindings.test.ts:222`.
- `MARKLESS_STATE_PROPERTY_CLASS_INSTANCE` — `state({ nav: new Nav() })` is refused, and so is a
  class instance on a `shared()` factory's returned object literal. Tests at lines 267 and 285.
  Serializable built-ins and plain-object fields are explicitly *not* refused (line 307).
- `MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS` (`packages/compiler/src/passes/symbol-modules.ts`)
  — a module-scope instance carried into **two or more** handler modules is refused, because each
  handler module runs its own constructor. Verbatim from the source: *"Each of those modules runs
  its own constructor, so they hold N separate instances and anything one of them records is
  invisible to the others."* Carried into **one** handler is fine and is the shape the carry exists
  for (test at line 355).

P1, P3 and P9 from the class-state memo are therefore closed. The memo's "four silent failure
modes" are now three diagnostics and one fixed defect.

### 6b. Module-scope declaration carry — commit `f18b6c23`

`f18b6c23` makes handler symbol modules carry same-file module-scope declarations, transitively, in
authored order, with their imports. The six tests name the contract exactly:

- *"a module-scope class and its instance reach the handler symbol module"*
- *"carried declarations keep authored order, so a class precedes its instance"*
- *"a module-scope plain function reaches the handler symbol module"*
- *"a declaration a carried declaration names is carried too"*
- *"a module-scope declaration the handler never names is not carried"*
- *"an import a carried declaration needs is carried with it"*
- *"a state name is not confused with a module-scope declaration"*

That is option **(d1)** in `research-class-state.md` §4, landed. It closes the gap the memo filed
as a separate defect, and it is what makes a browser-only helper viable *without a new authoring
API*.

### 6c. Parameterised methods via `event.target` — commit `2e11a8fe`

`packages/headless/components/src/otp/note.md`, re-measured on this tip: a shared method that
**takes a parameter** compiles with no diagnostic and the whole suite passes on the parameterised
shape. The old `MARKLESS_CAPTURE_OPAQUE_PROP` claim was stale; the capture TypeScript-parse fix
unblocked it.

**One condition, and it is load-bearing for select:** the argument must be read off
`event.target`, **not** `event.currentTarget`. From the note: `otp.commit(event.currentTarget.value)`
throws *"Cannot read properties of null (reading 'value')"* — a handler body is dispatched
asynchronously, and by the time the argument expression evaluates the event has finished
dispatching. The landed tabs family already writes it the right way
(`packages/headless/components/src/tabs/tabs.tsrx:132`, with the comment *"`target`, not
`currentTarget`: a lazy handler symbol runs after the native dispatch has finished"*).

Select needs parameterised methods more than any family shipped so far — `select.choose(value)`,
`select.highlight(index)` — so this is the capability that makes the family expressible.

### 6d. What select therefore needs, and what it does not

| QDS closure-state concern | Needed here? | Route |
| --- | --- | --- |
| `enabledIndices` memo | **No.** | `closest('[role="listbox"]').querySelectorAll('[role="option"]:not([aria-disabled="true"])')` from `event.target`, exactly as the landed tabs handler walks tabs. DOM order is navigation order |
| `valueToIndex` / `labelToIndex` maps | **No.** | the option element carries its own value; the handler reads it off the element it just found |
| `lowerCaseValues` / `lowerCaseLabels` | **Maybe.** | typeahead matches against `option.textContent.toLowerCase()`. For a 13-item list this is free. For a 500-item list it is a per-keystroke allocation — the case §9 question 4 asks the owner about |
| `SelectTypeahead.searchStr` + 750 ms timer | **Yes, and it is the only genuinely stateful one.** | two graph cells on the shared instance (`search: string`, `searchAt: number`), with the window checked as `Date.now() - searchAt > 750` rather than held in a `setTimeout` handle. This removes the timer entirely, which also sidesteps requirement R13 in `research-popover.md` §7.1 ("timers that survive resume" — **unproven**) |

**Conclusion: select needs no class, no module-scope instance, and no new authoring API.** The
typeahead buffer becomes two cells; everything else is a DOM walk. That is a stronger result than
the class-state memo expected, and the reason is 6b + 6c: a parameterised method plus a DOM walk
off `event.target` replaces the registry the memo was trying to preserve.

The module-scope carry is still worth *one* use here: a pure `matchOption(options, search)` helper
in module scope, named by exactly one handler. Two handlers naming it is fine — it is a function,
not an instance, so `MARKLESS_MODULE_INSTANCE_DIVERGENT_HANDLERS` does not apply (it fires only on
`new X()` initializers, `moduleScopeInstanceNames` in `symbol-modules.ts`).

### 6e. Per-item identity — a nested widget root

Same shape radio group settled on (`research-radio-group.md` §6c) and tabs shipped
(`tabs.tsrx:39`, `tabsPartState`): `select.item` roots a **second** `shared({ scope: 'widget' })`
family holding `value`, `disabled` and an `element()` handle. `select.itemlabel` and
`select.itemindicator` resolve that inner instance because they are inside it; `select.item`'s own
body resolves the outer select instance, because a root of a *different* family is not a boundary
for that family.

Two open risks carry over unchanged and are the same rows tabs and radio group pinned:

1. **Items inside a keyed `@for` are the shape every real select is authored in**, and remain the
   highest-value spike. otp's note records that a component instance inside an `@for` arm *now*
   follows the shared cell ("a looped `otp.item` follows the code exactly like a flat one") — but
   an otp item is a **part**, not a widget root. A `select.item` roots its own instance, which is
   the untested combination.
2. **A widget-root part inside a flipping `@if` arm is refused today** with
   `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` (otp note, "Boxes from an arm"). An arm decided once is
   fine in both modes. "One option only appears when a checkbox is on" is an everyday form, so this
   needs a named scenario either way.

---

## 7. Markless API design

### Parts

`select.root`, `.label`, `.trigger`, `.content`, `.item`, `.itemlabel`, `.itemindicator`,
`.field` — the QDS folder listing exactly, with QDS's own lowercase compound spelling.

`field` already means "the hidden native form control" in QDS's select, which is what our
convention says it means everywhere. No collision, no deviation. (Contrast radio group, where the
group-level `field` was a configuration part and had to be argued away.)

The four `createContextProxy` getters do **not** become parts; the `state` alias covers them.

### Types (`select-types.ts`)

```ts
import type { ElementHandle, Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'button'>;

export type SelectRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the chosen option. Omit it and nothing is chosen. */
	readonly value?: string;
	/** The popup is showing. Omit it and it starts closed. */
	readonly open?: boolean;
	/** Nobody can change the choice. */
	readonly disabled?: boolean;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `select.field`. */
	readonly name?: string;
	/** Called with the new value when a person chooses a different option. */
	readonly onChange?: (value: string) => void;
	/** Called when the popup opens or closes. */
	readonly onOpenChange?: (open: boolean) => void;
};

export type SelectItemProps = PropsOf<'div'> & {
	/** Submitted when this option is the chosen one. */
	readonly value: string;
	/** Nobody can choose this option; arrow keys skip it. */
	readonly disabled?: boolean;
};

export type SelectTriggerProps = Omit<TriggerProps, 'onClick' | 'onKeydown'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
	readonly onKeydown?: Handler<TriggerProps['onKeydown']>;
};

export type SelectLabelProps         = PropsOf<'label'>;
export type SelectContentProps       = PropsOf<'div'>;
export type SelectItemLabelProps     = PropsOf<'span'>;
export type SelectItemIndicatorProps = PropsOf<'span'>;
export type SelectFieldProps         = PropsOf<'select'>;

export type SelectInstanceState = Seeded<
	SelectRootProps,
	'value' | 'open' | 'disabled' | 'required' | 'name'
> & {
	/** Typeahead buffer and the moment its last key landed. Two cells, no timer. */
	search: string;
	searchAt: number;
	contentEl: ElementHandle<HTMLElement>;
	onChange?: SelectRootProps['onChange'];
	onOpenChange?: SelectRootProps['onOpenChange'];
};

/** One per rendered `<select.item>`; its parts read this, not the select. */
export type SelectItemState = {
	value: string;
	disabled: boolean;
};
```

`multiple` is **deliberately absent from v1** and is §9 question 3. Reasons: it changes `value`
from `string` to `string | string[]`, which is the only union in the family and the one thing that
would force every read path to branch; it changes `Enter` from commit-and-close to toggle-and-stay;
and it changes the hidden control from a `<select>` to a `<select multiple>` whose `FormData` shape
differs. QDS carries it, six of seven libraries carry it, so this is a scope decision, not a
capability one.

No `bind:value`, no `defaultValue`, no controlled/uncontrolled split: plain `value` + `onChange`,
plain `open` + `onOpenChange`.

### Sketch

```tsx
export const selectState = shared(() => {
	const select: SelectInstanceState = state({
		value: '', open: false, disabled: false, required: false, name: '',
		search: '', searchAt: 0,
	});
	const contentEl = element<HTMLElement>();

	return {
		...select,
		contentEl,
		onChange: undefined as ((value: string) => void) | undefined,
		onOpenChange: undefined as ((open: boolean) => void) | undefined,
		// Parameterised — unblocked on this tip, see §6c. The caller must read
		// the argument off `event.target`, never `event.currentTarget`.
		choose(next: string) {
			if (select.disabled || select.value === next) return;
			select.value = next;
			select.onChange?.(next);
		},
		setOpen(next: boolean) {
			if (select.disabled || select.open === next) return;
			select.open = next;
			select.onOpenChange?.(next);
		},
		typed(key: string, now: number) {
			select.search = now - select.searchAt > 750 ? key : select.search + key;
			select.searchAt = now;
		},
	};
}, { scope: 'widget' });

export const selectItemState = shared(
	() => ({ ...state({ value: '', disabled: false }) }),
	{ scope: 'widget' },
);

export function SelectTrigger({ children, onClick, onKeydown, ...rest }: SelectTriggerProps) @{
	const select = selectState();

	<button
		{...rest}
		type="button"
		role="combobox"
		aria-haspopup="listbox"
		aria-expanded={select.open ? 'true' : 'false'}
		aria-controls={select.contentEl}
		disabled={select.disabled}
		ui-open={select.open}
		onClick={(event) => { select.setOpen(!select.open); onClick?.(event); }}
		onKeydown={(event) => { /* the collapsed key table, §4a */ onKeydown?.(event); }}
	>{children}</button>
}

export function SelectItem({ value, disabled = false, children, ...rest }: SelectItemProps) @{
	const select = selectState();
	const item = selectItemState();
	item.value = value;
	item.disabled = disabled || select.disabled;
	const chosen = computed(() => select.value === item.value);

	<div
		{...rest}
		role="option"
		aria-selected={chosen ? 'true' : 'false'}
		aria-disabled={item.disabled ? 'true' : undefined}
		tabindex={-1}
		ui-selected={chosen}
		ui-disabled={item.disabled}
		onClick={(event) => {
			// `target`, not `currentTarget`: the handler symbol runs after dispatch.
			select.choose((event.target as HTMLElement).closest('[role="option"]')
				?.getAttribute('data-value') ?? '');
			select.setOpen(false);
		}}
	>{children}</div>
}
```

### What is expressible now that was not

`aria-controls={select.contentEl}` — an `element()` handle in an IDREF position, read by a part
inside the root — landed as `fb9e9d01`, *"element() handles in IDREF attributes on parts mint and
cross the edge (element-handle-id prop kind)"*. That is the capability the trigger→content link
needs, and it also carries `popovertarget`, which
`packages/compiler/src/passes/semantic-graph/idref-attributes.ts:21` already treats as an IDREF.

### What is still not expressible

| Wanted | Blocked by |
| --- | --- |
| `aria-labelledby={select.labelEl}` on the **root** | `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` — a root cannot read a handle from the factory it roots in an IDREF position. Not fatal here: the trigger is not the root, so `aria-labelledby={select.labelEl}` **on the trigger** is a part position and should work |
| `aria-describedby` naming two parts at once | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`; recorded as U-C at `textbox.browser.ts:131`. Select has no description part in the QDS list, so this does not bite v1 |
| `select.item` inside a **flipping** `@if` arm | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED` (§6e.2) |

### Platform-first, and the one thing it costs select

Per `research-popover.md` §7 the content is **never unmounted** — it is always in the tree and the
browser decides whether it shows (R4, and recommendation (a) there). For select that has a
concrete benefit the other families do not get: the option list is in the DOM at first paint, so
the label text for a preselected value is available immediately, which is the exact problem QDS's
`displayValue` prop exists to work around (§2.5). If that holds, `displayValue` is not a prop we
need. It is a claim to prove with a scenario (§8), not to assume.

---

## 8. Test plan

`packages/headless/components/src/select/select.browser.ts`, scenarios under
`src/select/scenarios/`. Part-role testids: `root`, `label`, `trigger`, `content`, `item`,
`itemlabel`, `itemindicator`, `field`, prefixed per option in multi-option scenarios
(`banana-item`, `banana-itemlabel`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — a label, a trigger, three options, nothing chosen.
2. `prefilled.tsrx` — a `value` that chooses the middle option. **Also the `displayValue` row**:
   assert the trigger shows the option's *label text*, not its raw value, on first paint and after
   SSR resume, with no extra prop. This is the §7 claim.
3. `signup-form.tsrx` — realistic: `name`, `required`, a real `<form>`, a submit that reads
   `FormData` (copy the dispatch-a-submit-event idiom from `checkbox.browser.ts:80`).
4. `unavailable-options.tsrx` — one disabled option, and a whole disabled select.
5. `long-list.tsrx` — thirteen options, matching aria-at's reference count so the set-size row
   diffs directly. Also the typeahead-window scenario.
6. `two-selects.tsrx` — two on one page; arrowing in one must not touch the other.
7. `options-from-data.tsrx` — options authored with a keyed `@for`. **Expected to be the row that
   fails first**; keep it and let it name the gap (§6e.1).
8. `optional-option.tsrx` — one option inside a flippable `@if` arm (§6e.2).
9. `with-onchange.tsrx` / `without-onchange.tsrx`.

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites. Explicit
SSR+resume rows for: the served HTML carries the right `aria-selected` option and the right
trigger text; the first `ArrowDown` after resume opens and highlights without committing; the
typeahead window is measured from the first key *after resume*, not from a stale `searchAt`.

Keyboard rows must assert the non-obvious rules directly:

- **`ArrowDown` inside the open listbox moves the highlight and does not change the value** (§4c
  Sequence C). This is the mirror image of radio group's arrow rule and the easiest one to get
  backwards if the two families are written by the same person in the same week.
- **`Escape` closes and leaves the value untouched** (Sequence E).
- **`Tab` from inside the open listbox commits and closes**, which is the one place select differs
  from every other overlay family.
- The hidden `select.field` is never reachable by keyboard and is never announced.

A screen-reader lane exists (`packages/headless/components/src/tabs/tabs.sr.ts`, and
`b079295d` grew the virtual reader to eight families). Select's `.sr.ts` should carry Sequences
A–E from §4c as captured transcripts.

---

## 9. Open questions

1. **Roving DOM focus, or `aria-activedescendant`?** QDS roves; the APG example uses
   activedescendant; the GitHub sample (§5) shows activedescendant is used almost exclusively where
   DOM focus must stay in a text field, which is not our case. **Recommended: rove**, matching QDS,
   Radix, Kobalte and Bits, and matching the roving model the tabs and radio-group families already
   ship. Wants a ruling because it changes every keyboard row.
2. **`role="combobox"` on the trigger — adopt, against QDS?** QDS ships `aria-haspopup="listbox"`
   on a bare button and no combobox role, which fails an aria-at priority-1 assertion.
   **Recommended: adopt the role.** This is a deliberate deviation from QDS behaviour (not from its
   part list) and should be argued, not silent.
3. **`multiple` in v1, or later?** **Recommended: later.** It is the only thing that makes `value`
   a union and it doubles the keyboard table. Six of seven libraries have it, so "never" is the
   wrong answer; "not in the first landing" is the proposal.
4. **Typeahead matching on `textContent`, or on a seeded label cell?** `textContent.toLowerCase()`
   per keystroke is free at 13 options and a real cost at 500. A seeded label cell per item removes
   the scan but adds a cell per option to the payload. **Recommended: `textContent` for v1**, with
   `long-list.tsrx` as the place a future measurement lands.
5. **Does a `select.item` — a widget root — survive a keyed `@for`?** Unproven for any family. otp
   proved a *part* does; tabs and radio group both pinned the widget-root case. Highest-value spike
   of this tranche, and it blocks the realistic scenario for select more than for any other family,
   because nobody hand-writes 13 options.
