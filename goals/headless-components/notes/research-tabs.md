# Tabs — component research for `@markless/ui`

**Research date:** 2026-08-21
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `42feea98`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/tabs/` (READ-ONLY)

---

## 1. Name and alternates

Searched under: tabs, tab list, tabbed interface, tab bar, segmented control, view switcher, toggle group.

- **Tabs** is the settled name in every tier-1 and tier-2 headless library. No library ships this
  pattern under another name.
- **Segmented control** is a *different* component that renders like tabs: it is a single-select
  choice of a value, not a disclosure of panels. The Component Gallery describes it as "a hybrid
  somewhere between a button group, radio buttons, and tabs". Where it switches a *value* rather
  than revealing a *panel*, the correct semantics are `radiogroup`/`radio`, not `tablist`/`tab` —
  see `research-radio-group.md`. Two of the GitHub results below make exactly this mistake in
  reverse (`<Tabs role="radiogroup">` in gumroad's `ConfigurationSelector.tsx`).
- **Tab bar / view switcher** in app shells is usually navigation between routes. Adrian Roselli's
  criticism of "tabs that are really navigation" applies: if activating the control changes the URL,
  it is a nav list, not a tablist. Worth one line in our docs; it does not change the API.

No alternative-named implementation found with a better pattern than the tier-1 libraries.

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
tabs-root.tsx  tabs-list.tsx  tabs-trigger.tsx  tabs-content.tsx
index.ts  research.mdx  tabs.css  tabs.browser.tsx
```

`index.ts` exports, and the repo root exports the namespace all-lowercase:

```ts
export { TabsRoot as root }      from "./tabs-root";
export { TabsList as list }      from "./tabs-list";
export { TabsTrigger as trigger} from "./tabs-trigger";
export { TabsContent as content} from "./tabs-content";
// libs/components/src/index.ts
export * as tabs from "./tabs";
```

**Four parts: root, list, trigger, content.** No indicator, no per-tab item wrapper.

### What QDS actually implements

| Concern | QDS behaviour (from the code, not the docs) |
| --- | --- |
| Root props | `value`, `bind:value`, `orientation` (`"horizontal"`), `loop` (`false`), `selectOnFocus` (**`true`**), `onChange$` |
| Identity | `value` is optional on trigger and content. When omitted, each part takes a **declaration-order index** from a counter (`context.currTriggerIndex++`) captured in `useConstant`, and matches on `Number.parseInt(selectedValue) === index`. Default root value is the string `"0"`. |
| Selection test | `isIndexBased \|\| isValueBased` — a trigger is selected if either its index or its `value` matches |
| Roving tabindex | `tabIndex={isSelected ? 0 : -1}` on the trigger |
| Arrow keys | `sync$` handler calls `preventDefault()` for the six navigation keys; an async handler then focuses the next/prev enabled trigger via `getNextEnabledIndex`/`getPrevEnabledIndex` over a `triggerRefs` array |
| Orientation gate | ArrowLeft/Right return early when vertical; ArrowUp/Down return early when horizontal |
| Activation | `onFocus$={[selectOnFocus ? handleSelect$ : undefined, ...]}` — automatic activation is the default |
| Content | `role="tabpanel"`, `hidden={!visible}`, `tabIndex={visible ? 0 : -1}`, `aria-live="off"` |
| List | `role="tablist"`, `ui-orientation` |

### Gaps in QDS worth not copying

1. **No `aria-controls` on the tab, no `aria-labelledby` on the tabpanel, no ids at all.** The APG
   requires both. QDS's own `research.mdx` lists them as "ARIA attributes to consider" and the
   implementation never landed them. Its axe test still passes because axe does not flag a missing
   `aria-controls` on `role="tab"`.
2. **No `aria-orientation` on the tablist** — only the custom `ui-orientation` attribute.
3. **No `disabled` handling on the trigger beyond the native `disabled` attribute** on the button
   (the enabled-index helpers read `ref.value?.disabled`).
4. `{...props}` is spread **last** on the trigger and content, after `aria-selected`/`tabIndex`, so a
   consumer can silently overwrite the ARIA state. Markless spreads `{...rest}` **first** by
   convention, which fixes this.

`tabs.browser.tsx` (27 tests) is the behaviour contract worth porting: initial selection, click
selection, roving tabindex, the four arrow keys in both orientations, Home/End, looping in both
orientations and both axes, orientation attribute, external state in both directions, `onChange`
firing, and the three roles.

---

## 3. Headless library survey

Fetched 2026-08-21.

| Library | Parts | Activation default | Loop | Identity |
| --- | --- | --- | --- | --- |
| **Base UI** (v1.x) | `Tabs.Root`, `Tabs.List`, `Tabs.Tab`, `Tabs.Indicator`, `Tabs.Panel` | **manual** (`activateOnFocus` on `List`, default `false`) | `loopFocus` on `List`, default `true` | `value` **required** on Tab and Panel; root `defaultValue` falls back to `0` |
| **Ark UI** | `Tabs.Root`, `List`, `Trigger`, `Indicator`, `Content` | `activationMode: 'automatic'` | `loopFocus`, default `true` | `value` required on Trigger and Content |
| **Radix UI** | `Root`, `List`, `Trigger`, `Content` | `activationMode: 'automatic'` | `loop` on `List`, default `true` | `value` on Trigger and Content |
| **Kobalte** | `Tabs`, `List`, `Trigger`, `Indicator`, `Content` | `activationMode: 'automatic'` | (always wraps) | `value` **required** on Trigger and Content |
| **Ariakit** | `TabProvider`, `TabList`, `Tab`, `TabPanel` | `selectOnMove` (default `true`) | wraps | store-registered; `id`/`tabId` linking, panels can be found by order |
| **Melt UI, Headless UI, Corvu, Dice UI** | ship Tabs; not fetched in depth — no divergence reported in the QDS notes | | | |

Consensus:

- **Four core parts** everywhere: root, list, trigger/tab, content/panel. **Indicator** is present in
  Base UI, Ark UI and Kobalte and absent from Radix and QDS.
- **`value` is the identity.** Every library keys trigger→panel by an explicit `value`; only QDS and
  Base UI have an index fallback, and Base UI's is only for the *root's* default.
- **Automatic activation is the majority default** (Ark, Radix, Kobalte, Ariakit, QDS). Base UI is
  the outlier and defaults to manual. The APG allows either and calls automatic activation
  appropriate "when the panels are rendered in the DOM and are cheap to display".
- **`loop` defaults true** everywhere except QDS (`false`) and Bits UI.
- Radix and Base UI put `loop`/`loopFocus` on the **List**, not the root. Ark and QDS put it on the
  root. Root is the better home for us: one place seeds the whole instance.

---

## 4. WAI-ARIA and expert commentary

**APG Tabs pattern** (w3.org/WAI/ARIA/apg/patterns/tabs/):

| Element | Required |
| --- | --- |
| tablist container | `role="tablist"`; `aria-label` or `aria-labelledby` when a visible label exists; `aria-orientation="vertical"` when vertical (horizontal is the default and may be omitted) |
| tab | `role="tab"`; `aria-controls` referring to its tabpanel; `aria-selected="true"`/`"false"` |
| tabpanel | `role="tabpanel"`; `aria-labelledby` referring to its tab; `tabindex="0"` when it holds no focusable content or its first content element is not focusable |

Keyboard, per the APG:

| Key | Behaviour |
| --- | --- |
| `Tab` | Into the tablist, focus lands on the **active** tab. From the tab, focus moves to the next element outside the tablist — normally the panel |
| `ArrowLeft` / `ArrowRight` | Previous / next tab, wrapping. Optionally activates on focus |
| `ArrowUp` / `ArrowDown` | Same as Left / Right when the tablist is vertical |
| `Space` / `Enter` | Activates the tab when it was not activated automatically on focus |
| `Home` / `End` | First / last tab (optional in the spec, universal in practice) |
| `Delete` | Optional, for closable tabs. Out of scope for us |

**Expert commentary.**

- Adrian Roselli, *When Is a Vetted Pattern No Longer a Vetted Pattern?* — the APG tab widget "is not
  well tested"; his concrete, testable point is that **`role="tab"` treats all its children as
  presentational**, so a nested interactive control inside a tab (a close button, a badge link) is
  stripped of its semantics and unreachable for some users. Practical consequence for our API: the
  trigger part must be documented as taking label content only; a closable-tab affordance has to be a
  *sibling* of the tab, not a child. His 2013 *ARIA Tabs* post is self-marked "old and wrong".
- He also warns against dressing route navigation up as tabs.
- Scott O'Hara's progressively-enhanced tabbed-interface demo is the pattern Roselli points to
  instead; the current URL for it 404s and it was not read for this note. Gap, flagged in §9.

### Expected screen-reader announcements

**Source:** `w3c/aria-at`, test plans `tests/apg/tabs-automatic-activation` and
`tests/apg/tabs-manual-activation` (`data/assertions.csv`, `data/tests.csv`,
`data/voiceover_macos-commands.csv`), read 2026-08-21. These are community-vetted *assertions* — the
information that must be conveyed and its priority — not verbatim strings; the sequences below turn
them into ordered spoken transcripts using each screen reader's usual phrasing. They are written so a
future transcript test can assert them; where a segment is a priority-2/3 assertion in aria-at
(nice-to-have, not required) it is marked `[p2]`/`[p3]`, and a segment aria-at explicitly excludes for
that command is not written at all.

The aria-at reference tab set is four tabs named "Maria Ahlefeldt", "Carl Andersen", "Christina
Nielsen", "Peter Müller" inside a tab list named "Danish Composers". Sequences below use those names
so they can be diffed against aria-at results directly.

**Sequence A — Tab into a tab list whose first tab is selected** (`navForwardsToTabList`)

1. keypress `Tab` (VoiceOver: also `ctrl+opt+right ×3`)
2. → "Danish Composers" `[p3: tab list name]`
3. → "tab list" `[p3]`
4. → "Maria Ahlefeldt"
5. → "tab"
6. → "selected"
7. → "1 of 4" `[p2: position + set size]`
8. → NVDA only: focus-mode beep — aria-at's `interactionModeEnabled` `[p2]`. VoiceOver does not
   switch modes here, and aria-at excludes this assertion for VoiceOver's `ctrl+opt+right` command.

**Sequence B — Tab into a tab list where no tab is selected**
(`navForwardsToTabListWhereATabIsNotSelected`) — identical to A except step 6 becomes
→ "not selected" `[p3]`.

**Sequence C — Arrow to the next tab, automatic activation** (`activateNextTabTabList`)

1. keypress `ArrowRight` (VoiceOver needs `arrowQuickKeyNavOff` for the arrow to reach the widget)
2. → "Carl Andersen"
3. → "tab"
4. → "selected"
5. → "2 of 4" `[p2]`
6. → **nothing about the panel.** aria-at asserts no panel information on this command. The panel
   swap is silent, which is the documented cost of automatic activation.

**Sequence D — Arrow to the next tab, manual activation** (`navToNextTabTabList`, manual plan)

1. keypress `ArrowRight`
2. → "Carl Andersen"
3. → "tab"
4. → "not selected" `[p3]` — the contrast with Sequence C step 4 is the whole difference between the
   two activation modes, and it is the row a transcript test should pin.

**Sequence E — Activate the focused tab in manual mode** (`activateTabInTabList`)

1. keypress `Enter` or `Space`
2. → "selected" — aria-at asserts *only* the state change here, priority 1. A reader that re-reads
   the whole tab is acceptable; a reader that says nothing is a failure.

**Sequence F — Tab out of the tab list into the panel** (`navForwardsToTabPanel`)

1. keypress `Tab`
2. → tab-list exit boundary: NVDA "out of tab list" `[p2]`; VoiceOver "end of tab list" `[p2]`
3. → "Peter Müller" — **the panel's name, taken from `aria-labelledby` → the tab.** aria-at gives
   this priority 1
4. → "tab panel"
5. → panel text `[p3]`

Step 3 is the announcement **QDS cannot currently produce**, because it wires no `aria-labelledby`
between panel and tab (§2). A reader then reaches an unnamed region and reads content with no
context. This is the single strongest argument for landing the value-keyed pairing in §6b, and it is
a priority-1 assertion in the community test plan, not a nicety.

**Sequence G — Read information about the focused tab** (`reqInfoAboutTabTabList`; VoiceOver
`ctrl+opt+f3`/`f4`, NVDA `NVDA+Tab`)

1. → "Maria Ahlefeldt" → "tab" → "selected" → "1 of 4" `[p2]` → "Danish Composers" → "tab list"

**NVDA vs VoiceOver, as aria-at records it.** aria-at ships a separate command file per screen
reader, and the differences that matter for us are mode and reach, not wording:

- NVDA reaches the widget in browse mode with quick keys and **switches to focus mode** on entry —
  the `interactionModeEnabled` assertion. VoiceOver navigates with the VO cursor
  (`ctrl+opt+arrow`) and needs `arrowQuickKeyNavOff` before plain arrow keys reach the tab list at
  all; aria-at drops `interactionModeEnabled` for VoiceOver's VO-cursor commands.
- Boundary announcements ("out of tab list", "end of tab list") are priority-2 in aria-at and phrased
  differently by each reader; a transcript test should assert *that a boundary was conveyed*, not the
  exact words.
- Disabled tabs: not covered by either aria-at plan. We skip them in navigation, so they are never
  announced; that behaviour is ours to test, without an aria-at reference.

`aria-live="off"` on the panel (QDS) is correct and worth keeping: the panel must not be a live
region, or every tab change would double-announce over Sequence C.

---

## 5. GitHub patterns (grep MCP)

Seven searches run; the tabs-relevant ones:

- `role="tablist"` (TSX) — very common, and **most hand-rolled uses are wrong**: TypeScript-Website
  puts `role="tablist"` on three separate `<Col>` wrappers each holding one `role="tab"`; several
  apps use `role="tablist"` for *filter pill rows* that are really multi-select filters. Confirms the
  value of shipping the pattern as a component.
- `role="tab"` + `aria-controls` (TSX) — the correct pattern is well represented in production code
  (Strapi, Supabase, Metabase, OpenHands, unsloth). Every one of them mints ids by hand:
  `id={`tab-${value}`}` / `aria-controls={`tabpanel-${value}`}`. **Nobody derives them; everybody
  writes an id-naming scheme.** This is exactly the job our `element()` handles exist to remove.
- `role="tabpanel"` + `aria-labelledby` (TSX) — MUI's own docs sample, Ionic, Metabase, Strapi. Same
  hand-minted-id pattern in the other direction.
- `tabIndex={isSelected ? 0 : -1}` (TSX) — the roving-tabindex idiom verbatim in reach-ui, Roo-Code,
  Mantine, Mailspring, ant-design, fluxer. Universal.
- Anti-pattern seen twice (Roo-Code's `Tab.tsx`, Supabase's section clients): `tabIndex={0}` on
  *every* tab alongside `aria-selected`, which makes an n-tab widget an n-stop tab sequence.
- Clever approach worth copying: `ChipTabs.tsx` (tinyhumansai/openhuman) and `ThemeGallery.tsx`
  (esengine) do arrow navigation with **no item registry at all** —
  `event.currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]')`, index into that
  NodeList, `.focus()`. DOM order *is* the navigation order. See §6.

---

## 6. Item identity — what tabs actually requires

This is the section the item-indexing framework unit needs.

Tabs has **two distinct identity problems**, and they have different answers.

### 6a. Navigation order — needs nothing new

Roving tabindex, arrow/Home/End movement, disabled-skipping and looping all need one thing: the
ordered list of enabled triggers, and which one the event came from. A `querySelectorAll` scoped by
`closest('[role="tablist"]')` from the event's `currentTarget` answers this at the moment of the
keystroke, in DOM order, with no registry, no index counter and no build-time cardinality question.
Two production codebases in §5 do exactly this. `ElementHandle<T> = T | undefined` is the live
element, so `.focus()` is available either way.

**Requirement: none.** Do not build an item registry for this.

### 6b. Trigger ↔ panel association — needs a value-keyed instance

`aria-controls` on the tab and `aria-labelledby` on the panel each need the *other* element's minted
id, and there are N pairs under one root. Today:

- `element()` mints one id per handle per widget instance. A `tabs` root has **one** instance, so one
  `triggerEl` handle names one trigger, not the third of four.
- `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` refuses a list, join or choice in an IDREF position:
  "An IDREF position takes exactly one element() handle written directly."
- `MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED` refuses a handle bound inside a keyed repeat, because it
  names one element per row. So authoring the triggers with `@for` forecloses the wiring outright.
- `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT` refuses the *root* reading its own factory's handle in
  an IDREF position — only parts placed inside the root may.

What would satisfy it: **an instance boundary per tab pair, keyed by the authored `value`**, so that
`<tabs.trigger value="billing">` and `<tabs.content value="billing">` — which are in different
subtrees — resolve the *same* sub-instance holding `triggerEl` and `panelEl`.

Nesting a second widget family inside the first is already proven to isolate correctly
(`packages/vitest-browser/browser/widget-shared.test.ts`, "a widget projected into another widget
content resolves its own instance", fixtures `sel.tsrx` + `pnl.tsx`-family pair). What is **not**
available is resolving one sub-instance from *two sibling subtrees* by a shared key. That is the new
capability.

**Requirement for the item-indexing unit (tabs):**

1. A widget-scoped instance that is keyed within its enclosing root by an authored string value, and
   that two parts in different subtrees under that root both resolve by writing the same key.
2. Order-independence: the trigger may render before or after the panel; whichever renders first
   creates the sub-instance.
3. Each sub-instance carries its own `element()` handles, and both `aria-controls={panelEl}` and
   `aria-labelledby={triggerEl}` resolve from parts inside it.
4. It must survive SSR + resume with a stable per-key identity, since the minted ids are in the
   served HTML.
5. **Unproven and needs a spike either way:** whether a widget part may sit inside a keyed `@for` at
   all. `shared-seed-pass.ts` states the seed walk skips chunks "reached through a repeat, branch, or
   async arm"; branches are handled at render time by an emitted arm test, repeats are not, and no
   fixture in `packages/vitest-browser/browser/fixtures/` combines `scope: 'widget'` with `@for`.
   Item-shaped families are authored over data in real apps, so this is load-bearing.

Until (1)–(5) land, the honest v1 is **no `aria-controls`/`aria-labelledby`**, which is exactly where
QDS is. That should be a written, tested-for limitation, not silence.

### 6c. Selection state — needs nothing new

Whether a trigger is selected is `props.value === tabs.value` read off the shared instance. Same for
the panel's `hidden`. No index, no registry. This is why **`value` should be required**: QDS's
index fallback depends on a mutable construction-order counter on the context object
(`context.currTriggerIndex++` inside `useConstant`), and Markless seeds are explicitly an
order-independent instance phase. Reproducing the counter would mean reintroducing render-order
dependence into a phase the framework deliberately made order-free.

---

## 7. Markless API design

### Parts

`tabs.root`, `tabs.list`, `tabs.trigger`, `tabs.content` — the QDS folder listing exactly.

**`tabs.indicator` is deliberately not in v1.** It exists in Base UI, Ark and Kobalte but not in QDS,
and it is a pure-CSS concern (the three libraries publish `--active-tab-left`-style custom properties
computed from the active trigger's box). If it lands later it is `tabs.indicator`, which is already
a canonical role in our conventions.

### Types (`tabs-types.ts`)

```ts
import type { Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'button'>;

export type TabsOrientation = 'horizontal' | 'vertical';

export type TabsRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** The value of the tab that is showing. Omit it and the first tab shows. */
	readonly value?: string;
	/** Which axis the arrow keys walk. Omit it and the tabs run left to right. */
	readonly orientation?: TabsOrientation;
	/** Arrow past the last tab and land on the first. Omit it and the ends stop. */
	readonly loop?: boolean;
	/** Arrowing to a tab shows it. Omit it and arrowing only moves focus; Enter or Space shows it. */
	readonly selectOnFocus?: boolean;
	/** Called with the new value when a person changes tab. */
	readonly onChange?: (value: string) => void;
};

export type TabsListProps = PropsOf<'div'>;

export type TabsTriggerProps = Omit<TriggerProps, 'onClick' | 'onKeydown' | 'onFocus'> & {
	/** Names the tab. The content part with the same value is the panel it shows. */
	readonly value: string;
	readonly onClick?: Handler<TriggerProps['onClick']>;
	readonly onKeydown?: Handler<TriggerProps['onKeydown']>;
	readonly onFocus?: Handler<TriggerProps['onFocus']>;
};

export type TabsContentProps = PropsOf<'div'> & {
	/** Names the panel. The trigger part with the same value shows it. */
	readonly value: string;
};

export type TabsInstanceState = Seeded<
	TabsRootProps,
	'value' | 'orientation' | 'loop' | 'selectOnFocus'
> & {
	onChange?: TabsRootProps['onChange'];
};
```

Notes on the shape:

- `value` is **required** on trigger and content — §6c.
- `loop` and `selectOnFocus` live on the **root**, not the list, so one seed phase decides the whole
  instance (diverges from Radix/Base UI, matches Ark/QDS).
- `selectOnFocus` defaults to `true`, matching QDS and the majority of libraries.
- No `defaultValue`, no `bind:value`, no `activationMode` string: plain `value` + `onChange`, and a
  boolean where the choice is binary.

### Instance and root

```tsx
export const tabsState = shared(
	() => {
		const tabs: TabsInstanceState = state({
			value: '',
			orientation: 'horizontal' as TabsOrientation,
			loop: false,
			selectOnFocus: true,
		});

		return {
			...tabs,
			onChange: undefined as ((value: string) => void) | undefined,
			show(next: string) {
				if (tabs.value === next) return;
				tabs.value = next;
				tabs.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function TabsRoot({
	value = '',
	orientation = 'horizontal',
	loop = false,
	selectOnFocus = true,
	onChange,
	children,
	...rest
}: TabsRootProps) @{
	const tabs = tabsState();
	tabs.onChange = onChange;
	tabs.value = value;
	tabs.orientation = orientation;
	tabs.loop = loop;
	tabs.selectOnFocus = selectOnFocus;

	<div {...rest} ui-vertical={tabs.orientation === 'vertical'}>{children}</div>
}
```

`ui-vertical` as a presence attribute rather than `ui-orientation="vertical"`: our conventions say no
key-value state strings "unless genuinely multi-valued", and orientation is binary. QDS writes
`ui-orientation`; this is a deliberate, small deviation and CSS reads `[ui-vertical]` either way.

### List, trigger, content

```tsx
export function TabsList({ children, ...rest }: TabsListProps) @{
	const tabs = tabsState();

	<div
		{...rest}
		role="tablist"
		aria-orientation={tabs.orientation === 'vertical' ? 'vertical' : undefined}
		ui-vertical={tabs.orientation === 'vertical'}
	>{children}</div>
}

export function TabsTrigger({ value, children, onClick, onKeydown, onFocus, ...rest }: TabsTriggerProps) @{
	const tabs = tabsState();
	const selected = tabs.value === value;

	<button
		{...rest}
		type="button"
		role="tab"
		aria-selected={selected ? 'true' : 'false'}
		tabindex={selected ? 0 : -1}
		ui-selected={selected}
		ui-vertical={tabs.orientation === 'vertical'}
		onClick={(event) => { tabs.show(value); onClick?.(event); }}
		onFocus={(event) => { if (tabs.selectOnFocus) tabs.show(value); onFocus?.(event); }}
		onKeydown={(event) => { /* navigate(event, tabs); */ onKeydown?.(event); }}
	>{children}</button>
}

export function TabsContent({ value, children, ...rest }: TabsContentProps) @{
	const tabs = tabsState();
	const showing = tabs.value === value;

	<div
		{...rest}
		role="tabpanel"
		hidden={!showing}
		tabindex={showing ? 0 : -1}
		aria-live="off"
		ui-selected={showing}
	>{children}</div>
}
```

Handler composition is an authored closure at each site — no handler arrays. `{...rest}` is spread
first, so a consumer cannot overwrite `role`/`aria-selected` the way QDS's trailing spread allows.

`navigate` is a plain module function, not a part: it reads `event.key`, returns early on the axis
that does not match `tabs.orientation`, calls `event.preventDefault()` for the six navigation keys,
then walks `currentTarget.closest('[role="tablist"]').querySelectorAll('[role="tab"]:not([disabled])')`
and focuses the next/previous/first/last, wrapping when `tabs.loop`.

**Known landmine (U-M):** a Markless handler runs *after* dispatch returns, so `preventDefault()`
inside `onKeydown` "only sometimes wins" — this is recorded verbatim in
`packages/headless/components/src/checkbox/checkbox.tsrx:102` and in `checkbox.browser.ts:438`.
Tabs leans on `preventDefault` for six keys, where checkbox leans on it for one, so tabs is the
family that will make this hurt. Arrow-key page scrolling during tab navigation is the visible
symptom. **This should be priced before the tabs implementation unit is cut, not discovered in it.**

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-controls` on the tab, `aria-labelledby` on the panel | one `element()` handle per widget instance; §6b |
| Triggers authored with `@for` over data | `MARKLESS_ELEMENT_HANDLE_IDREF_ROW_OWNED` if ids are ever wired; widget-part-inside-repeat is unproven regardless |
| `aria-describedby` on anything from two parts at once | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`, recorded as U-C in `textbox.browser.ts:131` |

### Flippable arms

A `tabs.content` inside an `@if` arm mounts and unmounts live (same-module and imported markup-only
components). A `tabs.trigger` inside an arm is the realistic case — conditionally offered tabs — and
should work for the same reason. Shared-instance children *inside* arms still refuse, so an
`@if` arm containing a `tabs.trigger` that itself roots a nested widget is out. Tabs has no nested
family in v1, so tabs is not where this bites; radio-group and checklist are (see those notes).

---

## 8. Test plan

`packages/headless/components/src/tabs/tabs.browser.ts`, scenarios under `src/tabs/scenarios/`.
Part-role testids: `root`, `list`, `trigger`, `content`, prefixed per scenario where several widgets
appear (`billing-trigger`, `usage-content`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — three tabs, three panels, first showing.
2. `settings-panels.tsrx` — a realistic settings page: named values, one disabled tab, panel content
   with its own focusable controls.
3. `vertical.tsrx` — `orientation="vertical"`.
4. `looping.tsrx` — `loop`, one disabled tab in the middle.
5. `manual-activation.tsrx` — `selectOnFocus={false}`.
6. `with-onchange.tsrx` / `without-onchange.tsrx` — the callback fires with the new value; omitting
   it still switches tabs (mirrors the checkbox suite's pair).
7. `two-widgets.tsrx` — two tab sets on one page; clicking one must not move the other. This is the
   widget-instance-isolation row, and it is the one that catches a regression in `scope: 'widget'`.
8. `arm-tabs.tsrx` — a tab and its panel inside a flippable `@if` arm.

Mode loop: rows that assert the same thing in CSR and SSR run once per mode with a literal
`render`/`renderSSR` call site each (the SSR harness rewrites a literal mount call, so no helper —
copy the `MODES` idiom from `checkbox.browser.ts:60`). Explicit SSR+resume rows for: initial
selection served in the HTML; the first click after resume switching panels; roving tabindex correct
before any interaction.

Assertions that must be present because QDS lacks them: `aria-orientation` on the tablist when
vertical; `{...rest}` cannot overwrite `role`/`aria-selected`; and an explicit red-or-documented row
for `aria-controls`/`aria-labelledby` (assert absent + a comment naming §6b, in the shape of
`textbox.browser.ts:131`, so the row turns green the day the capability lands).

---

## 9. Open questions

1. **Value required vs. index fallback.** Recommended: required. Confirm with the PM — it is the one
   place this design deliberately breaks QDS source compatibility.
2. **`selectOnFocus` default.** QDS and most libraries say automatic; Base UI (the newest tier-1)
   says manual, and manual is friendlier when a panel is expensive. Recommended: keep `true` to match
   QDS, and document the tradeoff.
3. **U-M and `preventDefault` for arrow keys** — price it before the implementation unit.
4. **`ui-vertical` vs `ui-orientation`** — small, deliberate deviation; wants a ruling once so all
   three tranche-3 families spell it the same way.
5. Scott O'Hara's progressively-enhanced tabs write-up was not read (the URL Roselli links now 404s).
   Worth one follow-up fetch before the implementation unit if the PM wants the progressive-
   enhancement angle covered.
