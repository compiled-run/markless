# Radio group — component research for `@markless/ui`

**Research date:** 2026-08-21
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `42feea98`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/radio-group/` (READ-ONLY)

---

## 1. Name and alternates

Searched under: radio group, radio buttons, choice group, segmented control, toggle group, button
group, option group.

- **Radio group** is universal in headless libraries: Radix, Base UI, Ark, Kobalte, Melt, Bits,
  Headless UI, React Aria all ship `RadioGroup`.
- **Segmented control** is the same *semantics* with a different visual: The Component Gallery calls
  it "a hybrid somewhere between a button group, radio buttons, and tabs", and Mantine, Morningstar
  and several design systems ship it as a distinct component that is a radio group underneath.
  **Consequence for us: no separate family.** A segmented control is `radiogroup.root` with different
  CSS, and that should be one of our scenarios so the styling story is proven.
- **Toggle group** in Radix is a *different* component (multi-select, `role="group"` of toggle
  buttons). Not this family.
- Real-world confusion, from the GitHub search: gumroad's `ConfigurationSelector.tsx` renders
  `<Tabs role="radiogroup">` with `<Button role="radio">` children — a tabs component reskinned into
  a radio group. Shipping this family well removes that reach-for-tabs reflex.

No alternative-named implementation found with a pattern the tier-1 libraries lack.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
radio-group-root.tsx            radio-group-label.tsx
radio-group-item.tsx            radio-group-description.tsx
radio-group-item-trigger.tsx    radio-group-error.tsx
radio-group-item-indicator.tsx  radio-group-field.tsx
radio-group-item-label.tsx      radio-group-item-field.tsx
index.ts  radio-group.css  radio-group.browser.tsx  research.md
```

`index.ts`, and the namespace name at the repo root:

```ts
export { RadioGroupDescription   as description }   from "./radio-group-description";
export { RadioGroupError         as error }         from "./radio-group-error";
export { RadioGroupField         as field }         from "./radio-group-field";
export { RadioGroupItem          as item }          from "./radio-group-item";
export { RadioGroupItemField     as itemfield }     from "./radio-group-item-field";
export { RadioGroupItemIndicator as itemindicator } from "./radio-group-item-indicator";
export { RadioGroupItemLabel     as itemlabel }     from "./radio-group-item-label";
export { RadioGroupItemTrigger   as itemtrigger }   from "./radio-group-item-trigger";
export { RadioGroupLabel         as label }         from "./radio-group-label";
export { RadioGroupRoot          as root }          from "./radio-group-root";
// libs/components/src/index.ts
export * as radiogroup from "./radio-group";
```

**Ten parts.** Note the namespace and the compound part names are **all-lowercase with no
separator** — `radiogroup.itemtrigger`, not `radio-group.item-trigger`. A JSX member tag cannot carry
a hyphen, so this is forced, and QDS already settled the spelling. We match it exactly.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | `role="radiogroup"`, `aria-labelledby={localId}-label` **always** (even when no label part is mounted — a dev-mode `PostRender` warns), `aria-describedby` from an id list, `ui-orientation`, `ui-disabled`, `aria-disabled` |
| Root props | `value` (`""`), `orientation` (`"vertical"`), `loop` (**`true`**), `disabled` (`false`), `onChange$` |
| Item | plain `div`, `styleBoundary`, `ui-selected`; owns a **second context** (`radioGroupItemContextId`) holding `itemId`, `index`, `value`, `isSelected` |
| Item identity | `value ?? String(index)`, where `index` comes from a construction-order counter `context.currItemIndex++` inside `useConstant`; the resolved value is written into `context.itemValues.value[index]` |
| Item trigger | a `div` with `aria-checked` and a click handler — **no `role="radio"`, no tabindex** |
| Item field | the real interactive element: a `VisuallyHidden` native `<input type="radio">` carrying `name`, `value`, `checked`, `disabled`, `required`, the roving `tabIndex`, and all the arrow-key handling. Rendered automatically *by* `itemtrigger`, and also exported as a part |
| Roving tabindex | on the hidden input: `-1` when the group is disabled; `0` when nothing is selected and this is index 0; otherwise `0` iff selected |
| Arrow keys | `sync$` preventDefault for the six keys, then focus **and select** the next/prev enabled input via `getNextEnabledIndex`/`getPrevEnabledIndex` over `inputRefs`. Left/Up and Right/Down are **not** gated on orientation |
| Home / End | first / last enabled item, focus **and** select |
| `field` (group-level) | renders nothing; writes `name`, `required` into context in a task, and dev-warns if items rendered first |
| Label / description / error | mint `${localId}-label` / `-description` / `-error`; description and error append/remove their id from `describedByIds` |

### Things to fix rather than copy

1. **`aria-labelledby` always points at an id that may not exist.** QDS emits the attribute
   unconditionally and warns in dev when no `RadioGroup.Label` was mounted. A dangling IDREF is worse
   than no attribute — the group ends up with no accessible name *and* a broken reference.
2. **The item trigger carries `aria-checked` but not `role="radio"`.** On a plain `div` with no role,
   `aria-checked` is inert. The real radio semantics come from the hidden native input. It works, but
   the trigger's `aria-checked` is decoration; our version should either give the trigger the role or
   drop the attribute rather than half-state it.
3. **Arrow keys ignore orientation** even though the root takes an `orientation` prop and writes
   `ui-orientation`. Every library that supports orientation gates the axis (§3).
4. **`radiogroup.itemtrigger` renders `<RadioGroupItemField />` for you**, *and* `itemfield` is a
   public part, so a consumer who places both gets two inputs. Undocumented footgun.
5. `radio-group-item-label` takes no props at all — `PropsOf` is dropped, so a consumer cannot put a
   testid or class on it.

`radio-group.browser.tsx` (30 tests) is the behaviour contract: role, `aria-labelledby`, initial
unchecked state, click selection, initial `value`, four arrow keys, looping both ways, Home/End,
group `disabled`, `ui-selected`, `ui-orientation`, description + `aria-describedby`, external state
in both directions, `onChange$`, hidden inputs with the right `name` in a form, and required-field
error appearing/clearing.

---

## 3. Headless library survey

QDS's own `radio-group/research.md` is an unusually good cross-library survey (Radix, Headless UI,
React Aria, Ark, Kobalte, Melt, Bits) and its findings were re-checked against Base UI and Bits UI on
2026-08-21. Summary of what is *universal*, which is what matters for our API:

| Decision | Universal? | Detail |
| --- | --- | --- |
| `Root` + `Item` decomposition | yes, 7/7 | forced by the `radiogroup`/`radio` ARIA pattern |
| Hidden native input for forms | yes, 7/7 | auto-rendered (Radix, Headless UI, Bits, Melt, Base UI) or an explicit part (Ark `ItemHiddenInput`, Kobalte `ItemInput`); React Aria makes the hidden input *be* the interactive element |
| `value` on the item, `string` | yes, 7/7 | Headless UI is the only generic-`T` outlier |
| `disabled` at group and item level | yes, 7/7 | disabled items are **skipped** by arrow navigation everywhere |
| `role="radiogroup"` + `role="radio"` + `aria-checked` | yes | |
| Roving tabindex, single tab stop | yes, 7/7 | nobody uses `aria-activedescendant` for this pattern |
| Arrow keys **move focus AND select** | yes, 7/7 | this is the non-obvious one; unlike tabs, selection is not optional |
| Orientation gates the arrow axis | 5/7 (absent in Headless UI, React Aria) | Radix and Ark accept all four arrows regardless; Bits restricts to the matching pair |
| `loop` | Radix `true`, Melt `true`, Bits `false`, QDS `true`; absent (and always-wrapping) in React Aria, Headless UI, Kobalte | the APG says arrows SHOULD wrap |

Base UI 2026 specifics (fetched): parts are `RadioGroup`, `Radio.Root`, `Radio.Indicator`;
`RadioGroup` renders a `<div>` *plus a hidden `<input>`*; `Radio.Root` renders a `<span>` plus its own
hidden input; state is exposed as **presence** data attributes (`data-checked`, `data-unchecked`,
`data-disabled`, `data-readonly`, `data-required`, `data-valid`, `data-invalid`, `data-touched`,
`data-dirty`), not `data-state="checked"`. That is the newer convention and it is the one our `ui-*`
presence attributes already match.

Bits UI 2026: `RadioGroup.Root` + `RadioGroup.Item` only; `loop` defaults **false**; item exposes
`data-state`, `data-value`, `data-disabled`, `data-orientation`.

---

## 4. WAI-ARIA and expert commentary

**APG Radio group pattern** (w3.org/WAI/ARIA/apg/patterns/radio/), non-toolbar variant:

| Key | Required behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | move focus into and out of the group; entering lands on the **checked** radio, or the first radio when none is checked |
| `Space` | checks the focused radio if it is not already checked |
| `ArrowRight` / `ArrowDown` | move focus to the next radio, **uncheck the previous and check the new one**; wrap from last to first |
| `ArrowLeft` / `ArrowUp` | previous radio, same check-on-move; wrap from first to last |

Required roles and properties: `role="radiogroup"` on the container with `aria-label` or
`aria-labelledby`; `role="radio"` + `aria-checked="true"|"false"` on each option, named by its content,
`aria-label` or `aria-labelledby`; `aria-describedby` for extra description. The APG page does **not**
specify where `aria-required` or `aria-invalid` go — the cross-library convention (and QDS's own
survey) puts `aria-required` on the **group**, not on the items.

Once a radio is checked by a person, there is no path back to "nothing selected" through the UI. Only
a programmatic value change or a form reset restores it. Worth one line in our docs.

### Expected screen-reader announcements

**Source:** `w3c/aria-at`, test plan `tests/apg/radiogroup-roving-tabindex`
(`data/assertions.csv`, `data/tests.csv`, `data/voiceover_macos-commands.csv`), read 2026-08-21.
These are community-vetted *assertions* — what must be conveyed, and at what priority — not verbatim
strings; the sequences below turn them into ordered spoken transcripts in each reader's usual
phrasing, so a future transcript test can assert them. `[p2]`/`[p3]` marks an aria-at priority-2/3
assertion (should-convey, not must); segments aria-at excludes for a given command are omitted.

The aria-at reference group is three radios — "Regular crust", "Deep dish", "Thin crust" — in a group
named "Pizza Crust". The sequences use those names so results diff against aria-at directly.

**Sequence A — Tab forwards into a group where nothing is checked**
(`navForwardsInToRadioGroupWhereNoRadioButtonsAreChecked`)

1. keypress `Tab` (VoiceOver: also `ctrl+opt+right ×3`; NVDA quick key `j`)
2. → "Pizza Crust"
3. → "group" `[p2]`
4. → "Regular crust"
5. → "radio button"
6. → "unchecked" `[p3]`
7. → "1 of 3" `[p2: position + set size]`
8. → NVDA only: focus-mode beep, aria-at `interactionModeEnabled` `[p2]`; excluded for VoiceOver's
   VO-cursor command

**Sequence B — Tab forwards into a group where the first radio is checked**
(`navForwardsInToRadioGroupWhereFirstRadioButtonIsChecked`) — identical to A, except step 6 becomes
→ "checked" and it is **priority 1**, not p3.

**Sequence C — Shift+Tab backwards into a group where the last radio is checked**
(`NavBackIntoRadioGroupWhereLastRadioChecked`)

1. keypress `Shift+Tab`
2. → "Pizza Crust" → "group" `[p2]` → "Thin crust" → "radio button" → "checked" → "3 of 3" `[p2]`

Focus lands on the **checked** radio, not the first one. That is the roving-tabindex rule made
audible, and it is the row that catches a `tabindex` regression.

**Sequence D — Arrow to the next radio, which checks it** (`navToFirstRadio` / `navToLastRadio`)

1. keypress `ArrowDown` (or `ArrowRight`; VoiceOver needs `arrowQuickKeyNavOff`)
2. → "Regular crust"
3. → "radio button"
4. → "checked" — **priority 1.** The move and the check are one announcement. A reader that says
   "unchecked" here means our arrow handler moved focus without selecting, which is the most common
   way this pattern is got wrong.
5. → "1 of 3" `[p2]`

**Sequence E — Space on an unchecked focused radio** (`checkRadio`)

1. keypress `Space` (VoiceOver `ctrl+opt+space`)
2. → "checked" — aria-at asserts only the state change, priority 1. On an **already**-checked radio
   nothing changes and nothing new is announced; aria-at has no test for that because it is a no-op.

**Sequence F — Tab out of the start of the group** (`navOutStartRadioGroup`)

1. keypress `Shift+Tab`
2. → group-exit boundary: NVDA "out of group", VoiceOver "end of group" — aria-at `groupBoundary`,
   priority 2 for the VO-cursor command and **excluded** (priority 0) for plain `Shift+Tab`, because
   readers do not reliably announce a boundary on a tab-out
3. → "Navigate backwards from here" → "link"

**Sequence G — Read information about the focused radio** (`reqInfoAboutCheckedRadio`; VoiceOver
`ctrl+opt+f3`/`f4`, NVDA `NVDA+Tab`)

1. → "Regular crust" → "radio button" → "checked" → "1 of 3" `[p2]` → "Pizza Crust" `[p2]` →
   "group" `[p2]`

Steps 5–6 are why the **group must have an accessible name**: on a request-info command the reader
re-states the group, and with QDS's dangling `aria-labelledby` (§2) that step produces nothing. Note
also that aria-at's own *sibling* plan for tri-state checkboxes gets its group name from a
`fieldset`/`legend` (its `nameSandwichCondiments` assertion has `refIds: legend`), which is direct
support for the fieldset recommendation in §7.

**Not covered by aria-at, so ours to specify and test without a reference:** a disabled item (we skip
it, so it is never announced), a whole disabled group, and description/error text reaching the reader
through `aria-describedby`. For the error case the expected sequence is: focus the first radio →
name → "radio button" → state → position → "invalid entry" → error text.

**NVDA vs VoiceOver, as aria-at records it.** The differences are mode and reach, not wording:
NVDA arrives in browse mode via quick keys (`j` for form field, `l` for list) and **switches to focus
mode**; VoiceOver drives the VO cursor with `ctrl+opt+arrow` and needs `arrowQuickKeyNavOff` before
plain arrow keys operate the group at all, and aria-at drops `interactionModeEnabled` for those
commands. A transcript test should assert *that a boundary or mode change was conveyed*, never the
exact words.

Native `<input type="radio">` is the interactive element in the QDS design, and it is the shape
aria-at's reference implementation uses too — the most reliably announced option across NVDA, JAWS
and VoiceOver, better than `<button role="radio">`. Keep that choice.

---

## 5. GitHub patterns (grep MCP)

- `role="radiogroup"` (TSX) — plentiful, and the majority are **hand-rolled segmented controls**:
  `AppearanceOverview.tsx` and `ThemeGallery.tsx` (esengine), `InitFlow.tsx` (wails),
  `Radio.tsx` (LibreChat), `model-settings-popover.tsx` (synthetic-sciences). Every one is
  `role="radiogroup"` + `<button role="radio" aria-checked>`. Confirms §1: segmented control is this
  family, and it is the most common reason people write this by hand.
- Common **anti-pattern**: several of those hand-rolled groups have no roving tabindex at all — every
  option is a tab stop. `wails/InitFlow.tsx` and `LibreChat/Radio.tsx` both do this.
- Clever, and directly reusable: `ThemeGallery.tsx` navigates with
  `event.currentTarget.closest('[role="radiogroup"]').querySelectorAll('[role="radio"]')`, computes
  `(currentIndex + direction + values.length) % values.length` for wrapping, and calls `.focus()`.
  No registry. Same finding as tabs (§6a there).
- `tabIndex={isSelected ? 0 : -1}` (TSX) — the roving idiom on `role="radio"` appears verbatim in
  yaak's `SegmentedControl.tsx` and qwen-code's `ToolApproval.tsx`.
- `dataelement/bisheng` shows the "belt and braces" smell: a Radix `RadioGroup.Root` with a
  hand-added `role="radiogroup"` and `aria-required` on top of what Radix already emits.

---

## 6. Item identity — what radio group actually requires

### 6a. Group value and per-item selected state — needs nothing new

`selected = props.value === radiogroup.value`, read off the group's shared instance in each item.
No index, no registry.

### 6b. Navigation order and disabled-skipping — needs nothing new

Same answer as tabs: `closest('[role="radiogroup"]').querySelectorAll('input[type=radio]:not([disabled])')`
from the event's `currentTarget`, index into it, wrap when `loop`. DOM order is the navigation order.
Two production codebases in §5 do exactly this. Because arrow keys also **select**, the handler needs
the target item's value, which it reads off the focused input's own `value` attribute — still no
registry.

### 6c. Per-item element identity — needs a nested widget root

This is where radio group differs from tabs, and it is the **easier** case.

`radiogroup.itemlabel` needs `for={theItemsInput}`. `radiogroup.itemindicator` needs to know whether
*its* item is selected. Both are parts placed **inside** `radiogroup.item`, in the same subtree — not
in a sibling subtree the way a tab's panel is. So the answer is the already-proven one:

> **`radiogroup.item` is a widget root of a second `shared({ scope: 'widget' })` family.**

Each rendered item gets its own instance carrying `value`, `disabled`, and an
`element<HTMLInputElement>()` handle for its field. `itemlabel`, `itemtrigger`, `itemindicator` and
`itemfield` resolve that inner instance because they are inside it; `radiogroup.item`'s own body
resolves the *outer* group instance, because a root of a different family is not a boundary for that
family.

**Evidence this works:** `packages/vitest-browser/browser/widget-shared.test.ts`, test
"CSR: a widget projected into another widget content resolves its own instance", with the `sel` and
`pop` fixture families — a widget of one family nested inside another, each isolated, each trigger
affecting only its own. And `fixtures/nst.tsrx` documents the boundary rule for the *same* family:
"Every root is an instance boundary: the parts placed in a root's children belong to the INNERMOST
root that encloses them."

**Requirements for the item-indexing unit (radio group):**

1. Confirm by fixture that a component body may resolve family A's instance while itself rooting
   family B — i.e. `radiogroup.item` reads `radiogroupState()` and calls `radioitemState()`. The
   nested-family test above is strong evidence but does not assert this exact shape.
2. Confirm the **seed phase** ordering across the boundary: the group root seeds the item parts, and
   the item root seeds its own parts. `shared-seed-pass.ts` describes a projecting ancestor that
   roots a widget "of the same family" as a boundary the outer seed pass must not cross. Different
   families are, by that text, *not* a boundary — which is what we need, and what should be asserted.
3. **Items inside a keyed `@for` are unproven.** No fixture combines `scope: 'widget'` with `@for`,
   and `shared-seed-pass.ts` states the build-time seed walk skips chunks "reached through a repeat,
   branch, or async arm". Real radio groups are authored over an options array. This is the single
   highest-value spike for all three tranche-3 families.
4. Items inside a flippable `@if` arm: arms are handled (an emitted arm test runs the seed at render
   time), **but the packet notes shared-instance children in arms still refuse** — and a
   `radiogroup.item` inside an arm *is* a shared-instance child that roots its own instance. Expect
   this to refuse today. Needs a named fixture either way, because "one of the options only appears
   when a checkbox is on" is an everyday form.
5. No IDREF list is needed per item, so `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` is not in the way
   for the item — but see §7 for where it *is* in the way at the group level.

---

## 7. Markless API design

### Parts

`radiogroup.root`, `.label`, `.description`, `.error`, `.field`, `.item`, `.itemtrigger`,
`.itemindicator`, `.itemlabel`, `.itemfield` — the QDS folder listing exactly, with QDS's own
all-lowercase compound spelling and namespace.

Per our conventions, `field` is the name for the hidden native input, which is already what QDS calls
the per-item one (`itemfield`). But QDS's **group-level** `field` is a different thing: a
renders-nothing configuration part that pushes `name` and `required` into context. That is a name
collision against our convention, and it is the one place this family needs a ruling.

**Recommendation:** drop the group-level `field` part and move `name` and `required` onto
`radiogroup.root` as plain props. Reasons: it is one fewer part; it removes QDS's documented ordering
footgun (its own dev warning says `<RadioGroup.Field>` must come before any item or the props "may
not apply correctly"); Markless seeds are an order-independent instance phase, so props on the root
are exactly the right mechanism; and it makes `field` mean the same thing here as in checkbox,
toggle and textbox. **This is a deviation from the QDS folder listing and is argued, not silent.**

### Types (`radiogroup-types.ts`)

```ts
import type { Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'div'>;

export type RadioGroupOrientation = 'horizontal' | 'vertical';

export type RadioGroupRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the selected option. Omit it and nothing is selected. */
	readonly value?: string;
	/** Which axis the arrow keys walk. Omit it and the options stack top to bottom. */
	readonly orientation?: RadioGroupOrientation;
	/** Arrow past the last option and land on the first. Omit it and the ends wrap anyway. */
	readonly loop?: boolean;
	/** Nobody can change any option. */
	readonly disabled?: boolean;
	/** A choice is needed before the form submits. */
	readonly required?: boolean;
	/** Submitted under this name by `radiogroup.itemfield`. */
	readonly name?: string;
	/** Called with the new value when a person picks a different option. */
	readonly onChange?: (value: string) => void;
};

export type RadioGroupItemProps = PropsOf<'div'> & {
	/** Submitted when this option is the chosen one. */
	readonly value: string;
	/** Nobody can choose this option; arrow keys skip it. */
	readonly disabled?: boolean;
};

export type RadioGroupItemTriggerProps = Omit<TriggerProps, 'onClick'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
};

export type RadioGroupLabelProps       = PropsOf<'label'>;
export type RadioGroupItemLabelProps   = PropsOf<'label'>;
export type RadioGroupDescriptionProps = PropsOf<'div'>;
export type RadioGroupErrorProps       = PropsOf<'div'>;
export type RadioGroupItemIndicatorProps = PropsOf<'span'>;
export type RadioGroupItemFieldProps   = PropsOf<'input'>;

export type RadioGroupInstanceState = Seeded<
	RadioGroupRootProps,
	'value' | 'orientation' | 'loop' | 'disabled' | 'required' | 'name'
> & {
	invalid: boolean;
	onChange?: RadioGroupRootProps['onChange'];
};

/** One per rendered `<radiogroup.item>`; its parts read this, not the group. */
export type RadioGroupItemState = {
	value: string;
	disabled: boolean;
	selected: boolean;
	fieldEl: import('@markless/core').ElementHandle<HTMLInputElement>;
};
```

`value` is **required** on the item. QDS's `value ?? String(index)` fallback rests on a
construction-order counter, and Markless seeds are order-independent by design; reproducing the
counter would put render-order dependence back into a phase built to be free of it. Same argument as
tabs, and here it is stronger, because the item's value is also what the form submits.

No `bind:value`, no `defaultValue`, no `controlled`/`uncontrolled` split: plain `value` + `onChange`.

### Sketch

```tsx
export const radiogroupState = shared(() => {
	const group: RadioGroupInstanceState = state({
		value: '', orientation: 'vertical' as RadioGroupOrientation,
		loop: true, disabled: false, required: false, name: '',
	});
	const labelEl = element<HTMLLabelElement>();

	return {
		...group,
		labelEl,
		onChange: undefined as ((value: string) => void) | undefined,
		choose(next: string) {
			if (group.disabled || group.value === next) return;
			group.value = next;
			group.onChange?.(next);
		},
	};
}, { scope: 'widget' });

export const radiogroupItemState = shared(() => {
	const item = state({ value: '', disabled: false });
	const fieldEl = element<HTMLInputElement>();
	return { ...item, fieldEl };
}, { scope: 'widget' });

export function RadioGroupRoot({
	value = '', orientation = 'vertical', loop = true,
	disabled = false, required = false, name = '',
	onChange, children, ...rest
}: RadioGroupRootProps) @{
	const group = radiogroupState();
	group.onChange = onChange;
	group.value = value; group.orientation = orientation; group.loop = loop;
	group.disabled = disabled; group.required = required; group.name = name;

	<div
		{...rest}
		role="radiogroup"
		aria-orientation={group.orientation === 'horizontal' ? 'horizontal' : undefined}
		aria-required={group.required ? 'true' : undefined}
		aria-invalid={group.invalid ? 'true' : undefined}
		ui-horizontal={group.orientation === 'horizontal'}
		ui-disabled={group.disabled}
		ui-required={group.required}
	>{children}</div>
}

export function RadioGroupItem({ value, disabled = false, children, ...rest }: RadioGroupItemProps) @{
	const group = radiogroupState();   // outer family
	const item = radiogroupItemState(); // this item roots its own instance
	item.value = value;
	item.disabled = disabled || group.disabled;

	<div {...rest} ui-selected={group.value === value} ui-disabled={item.disabled}>{children}</div>
}

export function RadioGroupItemField({ ...rest }: RadioGroupItemFieldProps) @{
	const group = radiogroupState();
	const item = radiogroupItemState();
	const selected = group.value === item.value;

	<VisuallyHidden>
		<input
			{...rest}
			el={item.fieldEl}
			type="radio"
			name={group.name}
			value={item.value}
			checked={selected}
			disabled={item.disabled}
			required={group.required}
			tabindex={/* roving: see below */ selected ? 0 : -1}
			onChange={() => group.choose(item.value)}
			onKeydown={(event) => { /* navigate(event, group) */ }}
		/>
	</VisuallyHidden>
}

export function RadioGroupItemLabel({ children, ...rest }: RadioGroupItemLabelProps) @{
	const item = radiogroupItemState();
	<label {...rest} for={item.fieldEl}>{children}</label>
}
```

Roving tabindex has one wrinkle the naive `selected ? 0 : -1` misses: when **nothing** is selected the
first enabled item must still be reachable by Tab. QDS solves it with the item's index
(`!selectedValue && index === 0 → 0`). Without an index, the equivalent test is a DOM one done in the
same `closest(...).querySelectorAll(...)` walk the navigation handler already uses — "am I the first
enabled input in my group, and is the group's value empty". That keeps the no-registry property. It
should be an explicit test row, because it is the difference between a keyboard-reachable form and an
unreachable one.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-labelledby={group.labelEl}` on the root | `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` — the root cannot read a handle from the factory *it* roots in an IDREF position. **This is the group's accessible name**, so it is not a nicety |
| `aria-describedby` naming both `description` and `error` | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`; recorded as U-C in `textbox.browser.ts:131` |

The naming problem has a platform-first answer that dodges the diagnostic entirely and should be the
v1 design: **wrap the group in `<fieldset>` and make `radiogroup.label` render a `<legend>`.** A
`fieldset`/`legend` names its contents natively, with no id, no IDREF and no minted token, and it is
better supported than `aria-labelledby` on a `role="radiogroup"` div. It also gives group `disabled`
for free. Cost: `fieldset` has layout quirks (it cannot be a flex/grid container in some engines
without `display` being set, and `min-width: auto` is forced). Both are one CSS line in our docs.
**Recommend fieldset/legend; note `aria-labelledby` as the fallback once the root-IDREF restriction
lifts.** QDS's always-emit-a-dangling-IDREF behaviour should not be copied either way.

`aria-invalid` on the group is set by mounting `radiogroup.error`, exactly as checkbox and textbox do
it (`checkbox.tsrx:129`, `textbox.tsrx:130`).

---

## 8. Test plan

`packages/headless/components/src/radiogroup/radiogroup.browser.ts`, scenarios under
`src/radiogroup/scenarios/`. Part-role testids: `root`, `label`, `description`, `error`, `item`,
`itemtrigger`, `itemindicator`, `itemlabel`, `itemfield`, prefixed per option in multi-option
scenarios (`monthly-itemtrigger`, `annual-itemlabel`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — three options, none selected.
2. `prefilled.tsrx` — a `value` that selects the middle option.
3. `plan-picker-form.tsrx` — realistic: `name`, `required`, a real `<form>`, a submit that reads
   `FormData` (copy the dispatch-a-submit-event idiom from `checkbox.browser.ts:80`).
4. `segmented-control.tsrx` — the same family, horizontal, as a segmented control. Proves §1.
5. `unavailable-options.tsrx` — one disabled item, and a whole disabled group.
6. `with-help.tsrx` / `error-first.tsrx` — description and error, error written both after and
   before the items (order independence, mirroring the checkbox suite).
7. `with-onchange.tsrx` / `without-onchange.tsrx`.
8. `two-groups.tsrx` — two radio groups on one page; arrowing in one must not touch the other.
9. `options-from-data.tsrx` — items authored with a keyed `@for`. **Expected to be the row that
   fails first**; keep it and let it name the gap (§6c.3).
10. `optional-option.tsrx` — one item inside a flippable `@if` arm (§6c.4).

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites. Explicit
SSR+resume rows for: the served HTML carries the right `checked` input; the first arrow keypress after
resume both moves focus and changes the selection; roving tabindex is correct before any interaction
with **nothing** selected (the reachability row).

Keyboard rows must assert the APG's non-obvious rule directly: **ArrowDown both moves focus and
changes the value**, and `Space` on an already-checked radio is a no-op.

---

## 9. Open questions

1. **Group-level `field` part: keep or fold into root props?** Recommended: fold into `root`
   (`name`, `required`). This is the one deliberate departure from the QDS part list and wants a
   ruling before implementation.
2. **`fieldset`/`legend` vs `aria-labelledby` for the group name.** Recommended: fieldset/legend,
   because the root-IDREF restriction makes `aria-labelledby` inexpressible today and the native
   route is better supported anyway.
3. **`itemtrigger` rendering `itemfield` implicitly.** QDS does; it creates a double-input footgun.
   Recommended: no implicit render — the consumer places `radiogroup.itemfield`, the same way
   `checkbox.field` is placed today.
4. **Arrow keys gated on orientation, or all four always?** Recommended: gate on orientation
   (5 of 7 libraries, and it is what our `orientation` prop implies), unlike QDS which ignores it.
5. **Does a component body resolve family A while rooting family B?** Strong evidence yes; wants a
   fixture. Blocks the item design if it turns out no.
6. **Widget parts inside a keyed `@for`** — unproven, and it is the shape every real radio group is
   authored in. Highest-value spike of the three families.
