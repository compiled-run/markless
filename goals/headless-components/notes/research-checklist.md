# Checklist — component research for `@markless/ui`

**Research date:** 2026-08-21
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `42feea98`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/checklist/` (READ-ONLY)

---

## 1. Name and alternates

Searched under: checklist, checkbox group, check group, multi-select list, select-all, tri-state
checkbox, indeterminate parent, todo list.

- **Checkbox group** is the common name: Base UI `CheckboxGroup`, Ark UI `Checkbox.Group`, React Aria
  `CheckboxGroup`, Dice UI `CheckboxGroup`, Ariakit (an example, not a component). **Checklist** is
  QDS's own name, and it is the better one, because the family's distinguishing feature is the
  **select-all parent**, which no tier-1 library ships.
- **Kobalte, Corvu, Headless UI, Radix and Melt have no checkbox-group component at all** — a
  checkbox and nothing above it. QDS's `research.md` verified this and it still holds.
- Alternative-named implementations worth crediting:
  - **Flux UI** (`fluxui.dev/components/checkbox#check-all`) — the cleanest select-all opt-in API of
    anything surveyed; styled, not headless.
  - **Vuetify 0** ships a headless `Checkbox.Group` with `isAllSelected` / `isMixed` / `toggleAll`
    exposed as a provider, plus a `Checkbox.SelectAll` — the closest external match to QDS's shape.
  - **Dice UI** has `shift`-click range selection, which nothing else has.
  - **Angular Material**'s docs show the select-all computation done with signals.
- **Todo list** is a use case, not a component; nothing found under that name is reusable.

**Conclusion: keep the name `checklist`.** It is the QDS name, and it names the thing our family has
that a plain checkbox group does not.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
checklist-root.tsx                checklist-item.tsx
checklist-select-all.tsx          checklist-item-trigger.tsx
checklist-select-all-indicator.tsx checklist-item-indicator.tsx
checklist-label.tsx               checklist-item-label.tsx
checklist-error.tsx               checklist-item-description.tsx
checklist-hidden-input.tsx        checklist-context.tsx
index.ts  metadata.json  note.md  research.md  checklist.browser.tsx
```

`index.ts`, and the namespace name at the repo root:

```ts
export { ChecklistRoot as root }                          from "./checklist-root";
export { ChecklistItem as item }                          from "./checklist-item";
export { ChecklistItemLabel as itemlabel }                from "./checklist-item-label";
export { ChecklistItemIndicator as itemindicator }        from "./checklist-item-indicator";
export { ChecklistItemTrigger as itemtrigger }            from "./checklist-item-trigger";
export { ChecklistItemDescription as itemdescription }    from "./checklist-item-description";
export { ChecklistHiddenInput as hiddeninput }            from "./checklist-hidden-input";
export { ChecklistError as error }                        from "./checklist-error";
export { ChecklistSelectAll as selectall }                from "./checklist-select-all";
export { ChecklistSelectAllIndicator as selectallindicator } from "./checklist-select-all-indicator";
export { ChecklistLabel as label }                        from "./checklist-label";
// libs/components/src/index.ts
export * as checklist from "./checklist";
```

**Eleven parts.** Compound names are all-lowercase with no separator (`itemtrigger`,
`selectallindicator`) — a JSX member tag cannot carry a hyphen, and QDS settled the spelling. Match it.

### What checklist reuses from checkbox — the composition question, answered from imports

This is the part the packet asked to pin down exactly. Every checklist part is a thin wrapper over a
checkbox part:

| Checklist part | Imports and renders | Adds |
| --- | --- | --- |
| `checklist.root` | `CheckboxRoot` from `../checkbox/checkbox-root` | `role="group"`, `bind:checked={isAllCheckedSig}`, `ui-qds-checklist-root`, and provides `checklistContextId` |
| `checklist.item` | `CheckboxRoot` | takes an index from `context.currItemIndex++`, owns an `isCheckedSig`, and syncs it both ways with the parent |
| `checklist.itemtrigger` | `CheckboxTrigger` | nothing — a pass-through |
| `checklist.itemindicator` | `CheckboxIndicator` | nothing |
| `checklist.itemlabel` | `CheckboxLabel` | nothing |
| `checklist.itemdescription` | `CheckboxDescription` | nothing |
| `checklist.error` | `CheckboxError` | nothing |
| `checklist.hiddeninput` | `CheckboxHiddenInput` | narrows props to `{ name, value?, required? }` |
| `checklist.selectall` | `CheckboxTrigger` | `ui-qds-checklist-select-all-trigger`, and **clears** `ui-qds-checkbox-trigger` |
| `checklist.selectallindicator` | `CheckboxIndicator` | its own identity attribute, clears the checkbox one |
| `checklist.label` | `CheckboxLabel` | `ui-qds-checklist-select-all-label` |

So: **the checklist root IS a checkbox root** (the select-all box), and **each item IS a checkbox
root** nested inside it. Six of the eleven parts add nothing at all beyond a re-export; three add only
an identity attribute, which our conventions have already deleted (`ui-*` state attributes, no
`ui-qds-*` identity attributes). That is a strong, evidence-backed conclusion:

> **In Markless, seven of QDS's eleven checklist parts should not exist as separate components.** A
> consumer writes `checkbox.trigger`, `checkbox.indicator`, `checkbox.label`, `checkbox.description`,
> `checkbox.error` and `checkbox.field` directly inside `checklist.item`, because
> `checklist.item` roots a real checkbox instance and those parts resolve the innermost enclosing
> root of *their own* family. Only the parts that add behaviour survive.

That is a deviation from the QDS folder listing, argued rather than invented, and it is the main API
decision this document is asking for. §7 states the surviving list.

### How the tri-state actually works in QDS

`checklist-root.tsx`:

```ts
const isAllCheckedSig  = useSignal<boolean | "mixed">(false);
const checkedStatesSig = useSignal<(boolean | "mixed")[]>([]);
// task, tracking checkedStatesSig:
if (every === true)  isAllCheckedSig.value = true;
else if (every === false) isAllCheckedSig.value = false;
else isAllCheckedSig.value = "mixed";
```

`checklist-item.tsx` runs two tasks in the other direction: when `isAllCheckedSig` becomes exactly
`true` or exactly `false`, the item follows; and whenever the item's own `isCheckedSig` changes, it
writes itself into `checkedStatesSig[index]` and replaces the array to trigger the parent's task.
`"mixed"` on the parent deliberately does **not** propagate down.

Two consequences worth carrying forward:

1. The relationship is a **two-way sync through an index-keyed array**, and the index comes from a
   construction-order counter (`context.currItemIndex++` inside `useConstant`) — the same mechanism
   tabs and radio group use, and the same one Markless's order-independent seed phase does not
   provide.
2. Items have **no `value`**. Identity is position only. Form submission is per-item, through a
   `checklist.hiddeninput name="..."` the consumer places inside each item — the browser test's
   `FormExample` gives each item its own `name`, so a checked item submits `name=on` and an unchecked
   item submits nothing.

### Gaps in QDS worth not copying

1. **No `aria-controls` on the select-all**, which the APG mixed-checkbox example requires: the
   tri-state checkbox "identifies the set of checkboxes controlled by the mixed checkbox" with an
   IDREF list.
2. **No group name.** `checklist.root` is `role="group"` with no `aria-labelledby`; `checklist.label`
   renders a `CheckboxLabel` that names the *select-all trigger*, not the group. The APG checkbox
   pattern is explicit: a logical group with a visible label needs `role="group"` +
   `aria-labelledby`. QDS's own `research.md` lists this under "Known Issues".
3. **`checklist.root` is simultaneously the group and the select-all checkbox.** One element carries
   `role="group"` from the prop and the checkbox root's own state. It works because the checkbox root
   is a `div` with no role of its own, but it conflates two things the APG keeps separate.
4. Two identity attributes are cleared with `{...props}` ordering tricks
   (`ui-qds-checkbox-trigger={undefined}` *after* the spread) — an artefact of the identity-attribute
   scheme we already dropped.
5. `checklist.browser.tsx` has only 10 tests and covers no disabled state, no required validation, no
   group label, and no per-item description.

---

## 3. Headless library survey

Fetched 2026-08-21, plus QDS's own survey re-checked.

| Library | Group parts | Select-all / tri-state parent | Item identity |
| --- | --- | --- | --- |
| **Base UI** | `CheckboxGroup` + `Checkbox.Root` | **yes** — `allValues` on the group plus `parent` on one `Checkbox.Root`; the group computes the parent's `indeterminate` | `value: string`, group value is `string[]` |
| **Ark UI** | `Checkbox.Group` (+ `GroupProvider`); item parts `Root`, `Control`, `Indicator`, `Label`, `HiddenInput` | no parent control; `indeterminate` exists per checkbox | `value`, default `'on'` |
| **React Aria** | `CheckboxGroup` + `Label` + `CheckboxField`s + `Text slot="description"` + `FieldError` | no | `value` per checkbox; group value is `string[]` |
| **Dice UI** | `CheckboxGroup` | no parent; has **shift-click range selection** | `value` |
| **Ariakit** | example only, built from `Checkbox` + `role="group"` | no | `value` |
| **Vuetify 0** | headless `Checkbox.Group` + `Checkbox.SelectAll` | **yes** — `isAllSelected`, `isMixed`, `toggleAll` | value array |
| **Flux UI** | styled | **yes**, cleanest opt-in API | — |
| **Kobalte, Corvu, Headless UI, Radix, Melt** | **none** | — | — |

Two things stand out:

- **Base UI's `allValues` is the only tier-1 answer to the tri-state parent, and it is a
  declaration, not a discovery**: the consumer hands the group the complete list of child values, and
  the group compares it against the selected set. No registry, no index, no child registration. That
  is very attractive for Markless, because it sidesteps the whole item-indexing problem for the
  select-all computation (§6).
- **The group value is a `string[]` everywhere it exists** (Base UI, React Aria, Dice UI, Vuetify).
  QDS instead keeps a positional `(boolean | "mixed")[]` and no group value at all. The array-of-
  values shape is better: it is what a form submits, what a consumer stores, and what `onChange`
  should carry.

---

## 4. WAI-ARIA and expert commentary

**APG Checkbox pattern** (w3.org/WAI/ARIA/apg/patterns/checkbox/):

- `role="checkbox"`, accessible name from content / `aria-label` / `aria-labelledby`,
  `aria-checked="true" | "false"`, and for tri-state additionally `aria-checked="mixed"`.
- Keyboard: **`Space` only.** No arrow navigation — every checkbox is its own tab stop. This is the
  big structural difference from tabs and radio group, and it means checklist needs **no roving
  tabindex and no navigation handler at all**.
- Group guidance, quoted: "If a set of checkboxes is presented as a logical group with a visible
  label, the checkboxes are included in an element with role `group` that has the property
  `aria-labelledby` set to the ID of the element containing the label."
- `aria-describedby` on individual checkboxes or on the group for extra descriptive text.

**APG mixed-state checkbox example** (`patterns/checkbox/examples/checkbox-mixed/`): the tri-state
parent carries `role="checkbox"`, `tabindex="0"` and **`aria-controls` naming the IDREFs of the set it
controls**. Its `Space` behaviour is a three-way cycle: unchecked → mixed → checked → unchecked, and
returning to mixed restores "the last combination of states they had when the tri-state checkbox was
last mixed".

**That cycle is not what a select-all should do**, and this is an important distinction to record.
The APG example is a *standalone* tri-state control whose mixed state is a value the user can choose.
A select-all's mixed state is **computed** from its children and is never a destination: clicking
select-all while mixed checks everything. Every library and QDS agree on this, and so does our
landed checkbox (`checkbox.tsrx:44` — "Mixed resolves to checked, the way a native indeterminate box
does"). We follow the libraries, not the APG example, and say so in the docs.

`aria-controls` on the parent is worth keeping from the APG example, and it is the one thing this
family needs that the framework cannot currently express (§6c).

### Expected screen-reader announcements

**Source:** `w3c/aria-at`, test plan `tests/apg/checkbox-tri-state` (`data/assertions.csv`,
`data/tests.csv`), read 2026-08-21; the sibling plan `tests/apg/checkbox` covers the dual-state item.
These are community-vetted *assertions* — what must be conveyed and at what priority — not verbatim
strings; the sequences below turn them into ordered spoken transcripts, so a transcript test can
assert them later. `[p2]`/`[p3]` marks an aria-at priority-2/3 assertion.

aria-at's reference is a checkbox named "All condiments" inside a group named "Sandwich Condiments",
and **its group name comes from a `fieldset`/`legend`** — the `nameSandwichCondiments` assertion has
`refIds: legend`, and `roleGroup` has `refIds: fieldset`. That is direct support for §7's
recommendation to build the checklist group from `fieldset`/`legend` rather than
`role="group"` + `aria-labelledby`.

**Sequence A — Navigate forwards onto a partially-checked select-all** (`navForwardsToMixedCheckbox`)

1. keypress `Tab` (VoiceOver `ctrl+opt+right`; NVDA quick key `x`)
2. → "Sandwich Condiments" `[p2: group name]`
3. → "group" `[p2]`
4. → "All condiments"
5. → "checkbox"
6. → "partially checked" — NVDA says "half checked", VoiceOver says "mixed". aria-at asserts the
   *state*, priority 1, not the wording; a transcript test must accept either token.

**Sequence B — Navigate backwards onto the same control** (`navBackToMixedCheckbox`) — steps 4–6
only; aria-at drops the group name and role on a backwards entry.

**Sequence C — Read information about the select-all when it is fully checked**
(`reqInfoAboutMixedCheckboxThatIsChecked`; VoiceOver `ctrl+opt+f3`/`f4`, NVDA `NVDA+Tab`)

1. → "Sandwich Condiments" `[p2]` → "group" `[p2]` → "All condiments" → "checkbox" → "checked"

Unchecked is the same with → "unchecked" `[p3]` at the end
(`reqInfoAboutMixedCheckboxThatIsNotChecked`).

**Sequence D — Space on a partially-checked select-all** (`operateMixedCheckbox`)

1. keypress `Space`
2. → "checked" — aria-at asserts only the state change, priority 1.

Note this matches our design (mixed → checked), and it is where aria-at's plan and our behaviour
agree even though the APG *example*'s cycle differs; aria-at's `operateUncheckedCheckbox` expects
unchecked → **mixed**, which is the standalone-cycling behaviour we deliberately do not implement
(see above). **A transcript test for our select-all must therefore reuse Sequences A–D but replace
`operateUncheckedCheckbox` with our own row: unchecked → checked.** Recording that divergence here so
nobody later "fixes" our checklist to match the plan.

**Sequence E — Check one item, moving the parent into mixed** (ours; no aria-at reference)

1. keypress `Space` on the second item's checkbox
2. → "checked"
3. → **silence about the parent.** The select-all's state changed but focus did not move, and
   nothing announces it. This is the family's known accessibility weakness and the reason
   `aria-controls` on the parent matters: it gives a reader a way to *reach* the controlled set, even
   though nothing announces the parent's change automatically. Do **not** solve it with
   `aria-live` on the select-all — that would announce on every item toggle and is not what any
   library or the APG does.

**Sequence F — An item within the group** (from the sibling `tests/apg/checkbox` plan)

1. keypress `Tab` → "Lettuce" → "checkbox" → "not checked" `[p3]`
2. keypress `Space` → "checked"

Every item is its own tab stop; there is no position-in-set announcement, because a checkbox group is
not a set the way a radio group is. That is the audible difference between this family and radio
group, and it is worth one line in our docs so people pick the right one.

**NVDA vs VoiceOver, as aria-at records it.** Mode and wording both differ here: NVDA reaches the
control in browse mode and switches to focus mode; VoiceOver uses the VO cursor. For the mixed state
specifically, NVDA and JAWS say "half checked" / "partially checked" and VoiceOver says "mixed" — a
transcript test should assert the *assertion*, not one reader's token.

---

## 5. GitHub patterns (grep MCP)

- `aria-checked="mixed"` (TSX/TS) — the recurring production pattern is **not** to write the
  attribute at all on a native input. facebook/astryx's `CheckboxInput.tsx` says it outright: "On a
  native checkbox this is the authoritative way to expose the mixed state — a separate
  `aria-checked="mixed"` would be redundant and can desync from / override the native state". They
  set the `indeterminate` DOM *property* instead. remix-run/ui's checkbox styles match on
  `:indeterminate, [indeterminate], [aria-checked="mixed"], [data-state="mixed"]` — four spellings,
  because there is no agreement.
  **Implication for us:** our `checkbox.field` already sets `indeterminate` on the native input
  (`checkbox.tsrx:152`) and `aria-checked="mixed"` on the *button* trigger (`checkbox.tsrx:89`),
  which is the correct split — the ARIA state on the ARIA element, the DOM property on the native
  one. markuplint's rule `wai-aria-invalid-020` flags `<input type="checkbox" checked
  aria-checked="mixed">` as an error, confirming we must never put both on one element.
- reach-ui's `packages/checkbox/src/mixed.tsx` documents a real browser behaviour worth knowing: a
  user click sets the input's `indeterminate` property back to `false` even when the component's
  state does not change, so the property must be re-asserted after every click, not only on state
  change. Our `checkbox.field` re-renders `indeterminate` from state, so this should be covered —
  but it deserves an explicit SSR+resume test row, because a resumed input is not re-rendered.
- Select-all computation in the wild (`(?s)length === .*\.length \? true :.*mixed`): DevCloudFE's
  `StandardTable.tsx` is the canonical one-liner —
  `selected.size === 0 ? false : selected.size === list.length ? true : 'mixed'`. Same shape as
  QDS's task, computed from a **set of selected values**, not a positional array. Another vote for
  the `string[]` group value (§3).
- Nexus-Mods/Vortex's `Switch.tsx` shows the anti-pattern to avoid: a tri-state *switch*. A switch is
  binary by definition; the mixed state belongs to checkbox.

---

## 6. Item identity — what checklist actually requires

### 6a. Item toggling — needs nothing new

Every item is an independent checkbox, its own tab stop, `Space` to toggle. No navigation handler, no
roving tabindex, no order. This family is the *easiest* of the three on the keyboard.

### 6b. The select-all computation — needs nothing new, if the API is chosen well

Two possible designs:

**Design 1 (QDS): discovery.** Items register themselves into a positional array; the parent derives
`true`/`false`/`mixed`. Needs a per-item index from construction order — the exact mechanism
Markless's order-independent seed phase does not provide, for the same reason it does not for tabs
and radio group.

**Design 2 (Base UI `allValues`): declaration.** The root takes `value: string[]` (what is checked)
and `values: string[]` (what exists). The select-all state is a pure function of the two:

```ts
checked = value.length === 0 ? false : value.length === values.length ? true : 'mixed';
```

Each item compares its own `value` prop against `value.includes(...)`. **No registration, no index,
no order.** It is the same computation the production code in §5 does, and it is the design a
tier-1 library landed in 2026.

**Recommend Design 2.** It removes checklist from the item-indexing framework unit's critical path
entirely, which means checklist can ship *before* that unit lands — the only one of the three
tranche-3 families that can. That is worth saying to the PM plainly: **checklist is the cheapest
tranche-3 family and should probably go first.**

Cost of Design 2: the consumer states the option list twice — once as `values` on the root, once as
the items they render. Base UI accepts that cost; so should we; and in practice both come from the
same array in the consumer's code.

### 6c. `aria-controls` on the select-all — blocked, and it is the one real gap

The APG mixed-checkbox example puts an **IDREF list** on the parent naming every checkbox it
controls. Markless refuses this today, by design:

> `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` — "An IDREF position takes exactly one element() handle
> written directly, not a list, a join, or a choice between handles." The diagnostic's own rationale
> says the refusal "is a decision about ownership, not difficulty. Joining ids would make the
> compiler mint several ids, choose their order, and pick a separator — all of which are id
> SPELLING, which these records deliberately do not own."

That is a considered refusal, not an oversight, so the requirement to hand the framework team is
narrow and specific:

**Requirement (checklist):** an IDREF position that takes a *set* of `element()` handles and emits a
space-separated id list, with the compiler owning the order (document order) and the separator (a
single space, which the IDREF-list grammar fixes anyway, removing the "picking a separator" concern).
The two consumers are `aria-controls` on a tri-state parent and `aria-describedby` naming both a
description and an error — the latter already recorded as U-C in `textbox.browser.ts:131`, so this
one capability unblocks a limitation every family in the package currently carries.

Until it lands: **ship without `aria-controls`**, exactly where QDS is, with an explicit test row
asserting its absence and naming this section, in the shape of `textbox.browser.ts:131`.

### 6d. Nesting and the innermost-root rule

`checklist.item` roots a `checkbox` instance, and `checklist.root` roots both a `checklist` instance
and (in QDS) a `checkbox` instance for the select-all. Under the Markless rule — a widget root is an
instance boundary; parts resolve the innermost enclosing root **of their family** — this composes
cleanly *if* the select-all's checkbox instance and the items' checkbox instances are distinguishable.
They are not, if `checklist.root` roots a checkbox: `checkbox.trigger` written directly under
`checklist.root` (intended as the select-all) and one written inside `checklist.item` would both
resolve "the innermost enclosing checkbox root", which for the first is the checklist root and for
the second is the item. That actually works — but it is subtle enough to be a bug factory, and it
makes `checklist.root` two things at once (§2, gap 3).

**Recommendation: `checklist.root` does NOT root a checkbox.** Keep a distinct `checklist.selectall`
part that roots the select-all checkbox instance. Then every checkbox root in the tree is either
`checklist.selectall` or `checklist.item`, one level deep, and "innermost enclosing checkbox root" is
never ambiguous. This also lets `checklist.root` be a plain `fieldset`.

`checklist.root` inside `checklist.root` (nested checklists, a permissions tree) resolves to the
innermost by the same rule and is a legitimate future scenario; it is out of scope for v1 but the part
list should not foreclose it.

**Requirements for the item-indexing unit (checklist):**

1. IDREF *set* support (§6c) — shared with the other two families and with textbox.
2. **Items inside a keyed `@for` are unproven**, and this family is authored over data more than any
   other. `shared-seed-pass.ts`: the build-time seed walk skips chunks "reached through a repeat,
   branch, or async arm", and no fixture in `packages/vitest-browser/browser/fixtures/` combines
   `scope: 'widget'` with `@for`. Same spike as the other two notes ask for; here it is unavoidable,
   because a checklist over a literal list of items is a toy.
3. **A `checklist.item` inside a flippable `@if` arm.** Arms carry a render-time arm test in the seed
   pass, so a plain part in an arm mounts and unmounts live — but the packet records that
   shared-instance children in arms still refuse, and `checklist.item` roots its own checkbox
   instance, so it is exactly that case. Expect a refusal today. "Show the advanced options only when
   this box is ticked" is an everyday form, so this needs a named fixture and a verdict.
4. No per-item registration or ordering primitive is required if Design 2 is chosen (§6b).

---

## 7. Markless API design

### Parts

Surviving from the QDS listing:

`checklist.root`, `checklist.label`, `checklist.selectall`, `checklist.item`, `checklist.error`.

Deleted, because they add nothing our composition does not already give (§2):
`itemtrigger`, `itemindicator`, `itemlabel`, `itemdescription`, `selectallindicator`, `hiddeninput`.
A consumer writes `checkbox.trigger`, `checkbox.indicator`, `checkbox.label`,
`checkbox.description` and `checkbox.field` directly inside `checklist.selectall` and
`checklist.item`. **This is a deliberate departure from the QDS folder listing and is the API
question this document most wants ruled on.**

The argument for the departure: our conventions say a family that composes another "inherits the
composed family's API — do not re-invent it", and QDS's wrappers *are* re-invention — six of them are
literally `<CheckboxX {...props}><Slot/></CheckboxX>` and the other three differ only by identity
attributes we have already abolished. Keeping them would mean eleven parts with six aliases that
cannot diverge, plus a doc page explaining that `checklist.itemlabel` is `checkbox.label`.

The argument against, which the PM should weigh: `checklist.itemtrigger` reads better than
`checkbox.trigger` at the call site, and it keeps the family self-describing for someone who has only
read the checklist docs. If that wins, the compromise is to keep `itemtrigger`, `itemindicator` and
`itemlabel` as aliases and drop the rest.

### Types (`checklist-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type ChecklistRootProps = Omit<PropsOf<'fieldset'>, 'onChange'> & {
	/** The values that are ticked. Omit it and nothing is ticked. */
	readonly value?: readonly string[];
	/** Every value the list offers, in order. Select-all compares against this. */
	readonly values?: readonly string[];
	/** Nobody can change any item. */
	readonly disabled?: boolean;
	/** Called with the new set of ticked values whenever any item or select-all changes. */
	readonly onChange?: (value: readonly string[]) => void;
};

export type ChecklistLabelProps = PropsOf<'legend'>;

/** Roots the select-all checkbox instance. Its checkbox parts go inside. */
export type ChecklistSelectAllProps = PropsOf<'div'>;

export type ChecklistItemProps = PropsOf<'div'> & {
	/** Which of the root's `values` this item is. */
	readonly value: string;
	readonly disabled?: boolean;
};

export type ChecklistErrorProps = PropsOf<'div'>;

export type ChecklistInstanceState = Seeded<
	ChecklistRootProps, 'value' | 'values' | 'disabled'
> & {
	invalid: boolean;
	onChange?: ChecklistRootProps['onChange'];
};
```

Notes:

- `value` is `readonly string[]`, matching Base UI, React Aria, Dice UI and Vuetify, and matching what
  a form actually submits. QDS's positional `(boolean | 'mixed')[]` is an implementation detail
  escaping into the API.
- `onChange` is on the **root only**, per our conventions, and carries the whole new value.
- No `mixed` prop: the select-all's mixed state is computed, never set (§4).
- `checklist.item` takes a required `value`, for the same order-independence reason as the other two
  families — and here it is doubly required, since the value is what the form submits.
- No per-item `name`: `checkbox.field` inside an item already takes `name` from its own checkbox
  root, which `checklist.item` seeds. One `name` per item, stated once.

### Sketch

```tsx
export const checklistState = shared(() => {
	const list: ChecklistInstanceState = state({
		value: [] as readonly string[],
		values: [] as readonly string[],
		disabled: false,
	});

	return {
		...list,
		onChange: undefined as ChecklistRootProps['onChange'] | undefined,
		allChecked(): boolean | 'mixed' {
			if (list.value.length === 0) return false;
			return list.value.length === list.values.length ? true : 'mixed';
		},
		setItem(value: string, on: boolean) {
			const next = on
				? [...list.value, value]
				: list.value.filter((v) => v !== value);
			list.value = next;
			list.onChange?.(next);
		},
		setAll(on: boolean) {
			const next = on ? [...list.values] : [];
			list.value = next;
			list.onChange?.(next);
		},
	};
}, { scope: 'widget' });

export function ChecklistRoot({
	value = [], values = [], disabled = false, onChange, children, ...rest
}: ChecklistRootProps) @{
	const list = checklistState();
	list.onChange = onChange;
	list.value = value; list.values = values; list.disabled = disabled;

	<fieldset {...rest} disabled={list.disabled} ui-disabled={list.disabled}>{children}</fieldset>
}

export function ChecklistLabel({ children, ...rest }: ChecklistLabelProps) @{
	<legend {...rest}>{children}</legend>
}

// Roots the select-all checkbox: checkbox.trigger / .indicator / .label go inside.
export function ChecklistSelectAll({ children, ...rest }: ChecklistSelectAllProps) @{
	const list = checklistState();

	<checkbox.root
		{...rest}
		checked={list.allChecked()}
		disabled={list.disabled}
		onChange={(next) => list.setAll(next === true)}
	>{children}</checkbox.root>
}

// Roots one item's checkbox: checkbox.trigger / .indicator / .label / .field go inside.
export function ChecklistItem({ value, disabled = false, children, ...rest }: ChecklistItemProps) @{
	const list = checklistState();

	<checkbox.root
		{...rest}
		checked={list.value.includes(value)}
		disabled={disabled || list.disabled}
		value={value}
		onChange={(next) => list.setItem(value, next === true)}
	>{children}</checkbox.root>
}

export function ChecklistError({ children, ...rest }: ChecklistErrorProps) @{
	const list = checklistState();
	list.invalid = true;   // mounting the part is what marks the group invalid
	<div {...rest}>{children}</div>
}
```

`<fieldset>` + `<legend>` for the group and its name, rather than `role="group"` +
`aria-labelledby`: it is what aria-at's own tri-state reference implementation does (§4), it needs no
IDREF (so `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` never applies), and `disabled` on a fieldset
disables every control inside it natively. The CSS caveats are the usual two — a `fieldset` needs an
explicit `display` to be a flex or grid container in some engines, and `min-inline-size: auto` is
forced — and both are one line in our docs. Same recommendation as radio group, so the two families
stay consistent.

`checkbox.root` is passed `checked` and `onChange` from the checklist instance, which is the checkbox
family's existing public API. Nothing about checkbox needs to change: `checkbox.root` already takes
`checked?: boolean | 'mixed'` and calls `onChange` with the new value, and its `toggle()` already
resolves mixed to checked (`checkbox.tsrx:44`), which is exactly the select-all behaviour §4 wants.
**That is the strongest evidence the pilot's checkbox API was designed right.**

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-controls` on the select-all naming every item's trigger | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`; §6c |
| `aria-describedby` naming a description and an error together | same diagnostic; U-C, `textbox.browser.ts:131` |
| Items authored with a keyed `@for` | unproven; §6d.2 |
| An item inside a flippable `@if` arm | expected to refuse today; §6d.3 |

---

## 8. Test plan

`packages/headless/components/src/checklist/checklist.browser.ts`, scenarios under
`src/checklist/scenarios/`. Part-role testids: `root`, `label`, `selectall`, `item`, `error`, plus
the composed checkbox roles per instance (`selectall-trigger`, `lettuce-trigger`,
`lettuce-indicator`, `lettuce-label`, `lettuce-field`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — a select-all and three items, nothing ticked.
2. `partial.tsrx` — one of three ticked; the select-all must report `mixed` and the trigger must
   carry `aria-checked="mixed"` while `checkbox.field`'s native input carries the `indeterminate`
   property and **not** `aria-checked` (§5).
3. `condiments-form.tsrx` — realistic: `name` per item via `checkbox.field`, a real `<form>`, submit
   reads `FormData` and proves only ticked items appear (copy the submit-event idiom from
   `checkbox.browser.ts:80`).
4. `select-all-round-trip.tsrx` — tick select-all from empty → all ticked; untick from all → none;
   click select-all while mixed → all ticked (the divergence from the APG cycle, §4).
5. `unavailable-options.tsrx` — one disabled item, and a whole disabled group via the fieldset.
6. `with-help.tsrx` / `error-first.tsrx` — a group error written after and before the items.
7. `with-onchange.tsrx` / `without-onchange.tsrx` — `onChange` carries the whole new value array;
   omitting it still ticks.
8. `two-lists.tsrx` — two checklists on one page; select-all in one must not touch the other. This is
   the widget-instance-isolation row.
9. `items-from-data.tsrx` — items authored with a keyed `@for`. **Expected to be the first row that
   fails**; keep it and let it name the gap (§6d.2).
10. `optional-item.tsrx` — one item inside a flippable `@if` arm (§6d.3).
11. `nested-list.tsrx` — a checklist inside a checklist item, asserting the innermost-root rule.
    Special case, last, and acceptable to defer past v1.

Mode loop CSR/SSR for the shared rows, with literal `render`/`renderSSR` call sites per mode (the SSR
harness rewrites a literal mount call — copy the `MODES` idiom from `checkbox.browser.ts:60`).
Explicit SSR+resume rows for:

- the served HTML carries the right ticked items and a select-all in the right one of three states;
- **a click on a resumed mixed select-all ticks everything** — this is the reach-ui finding in §5
  (the browser resets an input's `indeterminate` property on click), and a resumed input is not
  re-rendered, so this row is where that bug would appear;
- ticking one item after resume moves the select-all from `false` to `mixed`.

Plus an absence row for `aria-controls`, naming §6c, in the shape of `textbox.browser.ts:131`, so it
turns green the day the IDREF-set capability lands.

---

## 9. Open questions

1. **Do the six pass-through parts survive?** Recommended: delete them; a consumer writes
   `checkbox.*` inside `checklist.item`. This is the biggest API question in the tranche and it wants
   a ruling before the implementation unit is cut. Compromise available (keep three aliases).
2. **`value: string[]` + `values: string[]` (Base UI's `allValues`) vs. QDS's item registration.**
   Recommended: the declarative pair — it is a tier-1 2026 design, it matches the production
   computation in §5, and it takes checklist off the item-indexing unit's critical path, which means
   **checklist can ship first of the three**.
3. **`fieldset`/`legend` vs `role="group"` + `aria-labelledby`.** Recommended: fieldset/legend,
   supported by aria-at's own reference implementation, and consistent with the radio-group note.
4. **Does `checklist.root` root a checkbox (QDS) or not?** Recommended: not — keep
   `checklist.selectall` as the only select-all root, so "innermost enclosing checkbox root" is never
   ambiguous (§6d).
5. **IDREF set support** — the one genuine framework gap this family needs, shared with radio group
   and already limiting textbox. Worth chartering on its own.
6. Dice UI's shift-click range selection is a real ergonomic win in long lists and nothing else has
   it. Out of scope for v1; noted so it is not lost.
