# Collapsible — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/collapsible/` (READ-ONLY)
**Markless facts read from:** the shared checkout on `feat/headless-ui-pilot` (session snapshot head `7c87ecf5`).
This worker's worktree is cut from `main` @ `8efcaef5` and holds only `base` + `checkbox`, so every
statement about shipped families (`toggle`, `textbox`, `progress`, `checklist`) was read out of the
shared checkout, not out of this tree.

**Cluster note.** This is one of four documents for the overlay cluster (collapsible, popover+modal,
tooltip, toast). The cluster's shared deliverable — what the four families genuinely need from the
framework — is consolidated in `research-popover.md` §7. Collapsible's contribution to that memo is
§8 below, and it is deliberately the *negative* case: **collapsible needs nothing new.** It is the
control that proves the open/close machinery works before elevation is added to it.

---

## 1. Name and alternates

Searched under: collapsible, disclosure, disclosure widget, accordion, expander, expandable,
show/hide, details/summary, toggle section, spoiler, drawer.

- **Disclosure** is the specification's name (`w3.org/WAI/ARIA/apg/patterns/disclosure/`) and the
  name aria-at uses for its test plans. **Collapsible** is the name most component libraries ship:
  Base UI `Collapsible`, Ark UI `Collapsible`, Radix `Collapsible`, Kobalte `Collapsible`, Bits UI
  `Collapsible`, Corvu `Disclosure`, Headless UI `Disclosure`, React Aria `Disclosure`, QDS
  `collapsible`. So the pattern is genuinely dual-named, split roughly library-vs-spec.
- **Accordion is a different family.** An accordion is a *set* of disclosures with group behaviour
  (single-open enforcement, arrow-key navigation between headers, a heading wrapper per item). Every
  tier-1 library that ships both builds `Accordion` on top of `Collapsible` (Base UI's
  `AccordionItem` literally renders a `CollapsibleRoot`). Accordion is **not** in the owner-agreed
  tranche list and QDS has no accordion folder, so it stays out; but the API below should not
  foreclose it, because an accordion item is a collapsible root with a heading around the trigger.
- **`<details>`/`<summary>`** is the platform's disclosure. It is not a competing library, it is the
  thing our family competes with, and §4 records why a headless family still earns its place.
- **Drawer / sheet** is a *different* pattern: an elevated panel with dismiss semantics. That is
  popover/modal territory (`research-popover.md`), not collapsible.
- **Alternative-named implementations** worth crediting:
  - **WordPress Gutenberg's `@wordpress/ui`** ships `Collapsible.Panel` with `hiddenUntilFound`
    defaulting to **`true`** — the only implementation found that makes find-in-page the default.
    Everyone else defaults it off. QDS also defaults it *on* (see §2), so QDS and Gutenberg are the
    two outliers in the same direction.
  - **Liveblocks' `Collapsible` primitive** feature-detects `"onbeforematch" in document.body`
    before wiring the listener — the cleanest progressive-enhancement shape seen (§5).

No alternative-named implementation was found with a better pattern than the tier-1 libraries.
**Recommendation: keep the QDS name `collapsible`.**

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
collapsible-root.tsx   collapsible-trigger.tsx   collapsible-content.tsx
index.ts   research.md   collapsible.browser.tsx   collapsible.driver.ts   collapsible.test.ts
```

`index.ts`, and the namespace name at the repo root:

```ts
export { CollapsibleRoot as root }       from "./collapsible-root";
export { CollapsibleContent as content } from "./collapsible-content";
export { CollapsibleTrigger as trigger } from "./collapsible-trigger";
// libs/components/src/index.ts
export * as collapsible from "./collapsible";
```

**Three parts: root, trigger, content.** No indicator, no header, no heading wrapper.

### What QDS actually implements

Read from the code, not the docs.

| Concern | QDS behaviour |
| --- | --- |
| Root props | `open`, `disabled`, `collapsible`, `disableUntilFound`, `onChange$`, plus `bind:open`/`bind:disabled`/`bind:collapsible` via `useBindings` (`collapsible-root.tsx:28-59`) |
| Ids | `const itemId = id ?? useId()`; trigger id is `` `${itemId}-trigger` ``, content id is `` `${itemId}-content` `` — a hand-rolled naming scheme, exactly the job `element()` exists to delete |
| Trigger | `role` left implicit on `<button>`; `aria-expanded={isOpen}`, `aria-controls={contentId}`, `disabled` **and** `aria-disabled` both set, `e.stopPropagation()` inside the click handler (`collapsible-trigger.tsx:14-29`) |
| Content | `hidden={"until-found"}` when closed **by default**; `hidden={true}` only when the root passes `disableUntilFound`; `onBeforematch$` sets `isOpen = true` (`collapsible-content.tsx:22-41`) |
| Root element | `ui-open` / `ui-closed` / `ui-disabled` presence attributes, `ui-qds-collapsible` identity attribute, `styleBoundary`, **and `aria-live="polite"`** (`collapsible-root.tsx:93-105`) |
| Change callback | a task tracking `isOpen`, guarded by an `isInitialLoadSig` so it does not fire on mount |

`collapsible.browser.tsx` is 33 tests: click/Space/Enter open and close, `aria-expanded` both ways,
`aria-controls` matching the content id, `onChange$` both directions, `bind:open` in both
directions, external signal **and** external store, disabled, client-side-rendered-after-mount
(three tests), the five `ui-*` attribute rows, the `aria-live` row, three `hidden="until-found"`
rows, and a synthetic `beforematch` dispatch.

### Four things in QDS worth not copying

1. **`aria-live="polite"` on the root is wrong and the suite pins it** (`collapsible.browser.tsx:421`).
   The whole disclosure pattern is that `aria-expanded` on the trigger conveys the state change —
   aria-at makes `stateChangeToExpanded` a **priority-1** assertion against `aria-expanded`, with no
   live region anywhere in the plan (§6). Making the root a live region means every open re-announces
   the entire revealed panel *on top of* the state change, which is the double-announcement Scott
   O'Hara's live-region write-up warns about. Drop it, and say why in the parity table.
2. **`collapsible` is a dead prop.** `useBindings` produces `collapsibleSig`, the root puts
   `isCollapsible` on the context (`collapsible-root.tsx:24, 54, 85`), and **no part reads it**. It
   is the accordion's "the last open item cannot be closed" rule with the accordion missing. Do not
   port a prop that does nothing.
3. **Both `disabled` and `aria-disabled`** on the trigger (`collapsible-trigger.tsx:25-26`). A native
   `<button disabled>` is already exposed as disabled; adding `aria-disabled="false"` to every
   enabled trigger is noise, and adding `aria-disabled="true"` alongside the native attribute is
   redundant. Set the native attribute only.
4. **`{...props}` is spread *first*** on trigger and content here (unlike QDS tabs), which happens to
   match our convention — but the root spreads `{...rest}` **last**, after `ui-open`/`aria-live`, so a
   consumer can overwrite the state attributes on the root. Our `{...rest}`-first rule fixes it.

### The negative-space prop: `disableUntilFound`

QDS's default is find-in-page-friendly and the opt-out is a negatively-named boolean. Two problems:
a double negative (`disableUntilFound={false}` means "enable until-found"), and it prices the
platform feature as the thing you turn *off*. Base UI, Ark UI, Radix and Gutenberg all spell it
positively (`hiddenUntilFound` / `hideMode`). §7 recommends the positive spelling with the QDS
default preserved.

---

## 3. Headless library survey

Fetched 2026-08-22 unless noted.

| Library | Parts | Open prop shape | Find-in-page | Unmount when closed |
| --- | --- | --- | --- | --- |
| **Base UI** (v1.7.x) | `Root`, `Trigger`, `Panel` | `open` / `defaultOpen: false` / `onOpenChange`; `disabled: false` | `hiddenUntilFound: false` on `Panel` | `keepMounted: false` on `Panel` |
| **Ark UI** | `Root`, `Trigger`, `Content`, `Indicator` | `open` / `defaultOpen` / `onOpenChange`; `disabled` | not offered; `hideMode: 'display-none'` instead | `lazyMount: false`, `unmountOnExit: false` |
| **Radix UI** | `Root`, `Trigger`, `Content` | `open` / `defaultOpen` / `onOpenChange`; `disabled` | not offered | `forceMount` |
| **Kobalte** | `Root`, `Trigger`, `Content` | same triple | not offered | `forceMount` |
| **Bits UI** | `Root`, `Trigger`, `Content` | same triple | not offered | `forceMount` |
| **Headless UI** | `Disclosure`, `Disclosure.Button`, `Disclosure.Panel` | render-prop `open`, no controlled prop | not offered | unmounts |
| **React Aria** | `Disclosure`, `DisclosurePanel`, `Button` | `isExpanded` / `defaultExpanded` / `onExpandedChange` | not offered | keeps mounted, uses `hidden` |
| **Corvu** | `Disclosure` (`Root`, `Trigger`, `Content`) | same triple | not offered | `forceMount` |
| **WordPress `@wordpress/ui`** | `Collapsible.Root/Trigger/Panel` | same triple | `hiddenUntilFound: **true**` | overridden by `hiddenUntilFound` |
| **QDS** | `root`, `trigger`, `content` | `open` + `bind:open` + `onChange$` | on by default, opt out with `disableUntilFound` | never unmounts |

Consensus, and where QDS sits:

- **Three parts everywhere.** Only Ark UI adds `Indicator`, and it is a pure-CSS affordance
  (`[data-state=open] &` rotates a chevron). QDS has none. Keep three.
- **The trigger is a `<button>` in every library.** Nobody offers a link, and Roselli's disclosure
  post is explicit that a link must never carry `aria-expanded` (§4).
- **`aria-controls` is set by every library that mints ids** — but see §4: the APG calls it
  *optional* and Roselli reports AT support for it is "sparse". It is cheap for us and it makes the
  `element()` handle earn its keep, so ship it.
- **Nobody puts a live region on the root.** QDS is alone.
- **Two axes are conflated across libraries and should stay separate for us:** (a) *is the panel in
  the DOM when closed* and (b) *can find-in-page reveal it*. `hidden="until-found"` answers both at
  once — the panel is in the DOM, laid out, and the browser reveals it. `keepMounted`/`forceMount`
  exists only because those libraries unmount by default. QDS never unmounts, so we inherit the
  simpler world.
- **`aria-expanded` lives on the trigger everywhere.** No library puts it on the root or the panel.

Libraries checked that lack the family: none. Every tier-1 and tier-2 library ships it.

---

## 4. WAI-ARIA and expert commentary

### APG — Disclosure pattern (`w3.org/WAI/ARIA/apg/patterns/disclosure/`)

Keyboard, quoted:

| Key | Behaviour |
| --- | --- |
| `Enter` | "activates the disclosure control and toggles the visibility of the disclosure content." |
| `Space` | "activates the disclosure control and toggles the visibility of the disclosure content." |

Roles, states and properties, quoted:

- "The element that shows and hides the content has role `button`."
- "When the content is visible, the element with role `button` has `aria-expanded` set to `true`.
  When the content area is hidden, it is set to `false`."
- "Optionally, the element with role `button` has a value specified for `aria-controls` that refers
  to the element that contains all the content that is shown or hidden."

That is the whole pattern. **There is no required attribute on the panel at all** — no
`role="region"`, no `aria-labelledby`, no `hidden` policy. A disclosure is a button that says whether
the thing below it is showing.

### Expert commentary

**Adrian Roselli, *Disclosure Widgets* (2020).** The load-bearing points for our API:

- The control must be a native `<button>` (or `role="button"`). On links: *"A link can accept it.
  Don't do it, of course. Do not add `aria-expanded` to a link."* Our trigger is a `<button>` and
  the `as`/polymorphic seam must not quietly permit an `<a>`.
- `aria-controls` is *"optional, and support in assistive technology is sparse"*. It is worth having
  for CSS/scripting association, not for announcement. Do not oversell it in docs.
- **Anti-pattern he names explicitly:** revealing content on hover or focus alone. That is a tooltip
  (`research-tooltip.md`), not a disclosure, and the two must not blur.
- **Anti-pattern:** moving focus into the revealed content on open, "without careful user testing".
  No library in §3 does this, and neither should we — it is not in the pattern.
- `<details>`/`<summary>` support caveats he documents: iPadOS VoiceOver does not expose `<summary>`
  as interactive once expanded; Firefox/TalkBack skips `<details>` entirely when navigating by
  controls; JAWS mishandles headings inside `<summary>`. **This is the argument for shipping a
  button-plus-`aria-expanded` family rather than telling people to use `<details>`.** It should be
  one sentence in our docs, not a paragraph.

**Scott O'Hara, *Are we live?* (2022)** — relevant here only as the reason to delete QDS's
`aria-live="polite"`: he recommends a live region be a **pre-existing, empty** element into which
content is injected, and warns that regions "quirky in how they expose" duplicate announcements. A
root that both is a live region and contains the state-changing trigger is the worst version of
that, and no other library does it.

**`role="region"` on the panel** — seen in a lot of production code (§5) and in accordion patterns,
where the APG *does* recommend it for accordion panels. For a lone disclosure it is not in the
pattern, and adding a landmark per FAQ answer floods the landmark list. Recommendation: **do not
set `role="region"`**; document it as something a consumer can add via `{...rest}` when the panel is
genuinely a landmark.

---

## 5. GitHub patterns (grep MCP)

Searches run (TSX/TypeScript unless noted): `hidden="until-found"`, `beforematch`,
`(?s)aria-expanded=\{.*aria-controls=\{` (regex), `(?s)role="region".*aria-labelledby=\{triggerId`
(regex), plus the cluster-wide `popover="auto"` / `popover="hint"` / `role="tooltip"` /
`role="status" aria-live="polite"` / `role="log"` sweeps whose collapsible-relevant hits are noted
below. Findings:

- **`aria-expanded` + `aria-controls` on a `<button>` is the overwhelmingly common hand-rolled
  shape** — AutoGPT (`ToolAccordion.tsx`, `CollapsedToolGroup.tsx`), freeCodeCamp
  (`donation-text-components.tsx`), Grafana (four separate implementations:
  `CollapseToggle.tsx`, `CollapsableSection.tsx` ×2, `RowExpander.tsx`), Storybook
  (`JsonNodeAccordion.tsx`). **Every one of them mints ids by hand**:
  `` id={`collapse-button-${id}`} ``, `` aria-controls={`collapse-content-${id}`} ``,
  `aria-controls={contentId}` with `contentId` from a `useId`. Same finding as tabs: nobody derives
  ids, everybody invents a naming scheme. This is precisely what `element()` deletes.
- **Anti-pattern found in production:** Grafana's `RowExpander.tsx` puts `aria-expanded` and
  `aria-controls` on a **`<div>` with an `onClick`** and no `role="button"` — the exact thing
  Roselli warns about, in a widely-used dashboard.
- **`role="region"` + `aria-labelledby={triggerId}` on the panel is a *very* common addition**
  (stagewise, Keystatic docs, TailGrids, seraui, three files in `starc007/ui-components`, `makecindy`).
  It is not in the disclosure pattern; it *is* in the accordion pattern. Its popularity is evidence
  people are hand-rolling accordions out of disclosures — which is an argument for eventually
  shipping `accordion`, not for putting a landmark on a lone panel.
- **`inert={!isOpen}` alongside `hidden`** appears in stagewise's `faq-item.tsx` and
  `bouncy-accordion.tsx`. Where the panel is animated with `grid-template-rows: 0fr` rather than
  `hidden` (very common in the sample), `inert` is doing the real "not reachable" work. Worth one
  line in our CSS-considerations section: **if a consumer animates height instead of using our
  `hidden`, they own reachability.**
- **`hidden="until-found"` is a live, correctly-understood feature**, not a curiosity: Base UI
  (`CollapsiblePanel.tsx`, `AccordionRoot.tsx`), Gutenberg (`collapsible-card/types.ts`,
  `collapsible/stories`), plus tooling that has had to learn about it — htmlnano refuses to collapse
  it to a bare `hidden`, Astro asserts the raw HTML keeps the value because *cheerio normalises it
  away*, Vue's hydration tests accept `"UNTIL-FOUND"` case-insensitively, Tailwind's preflight ships
  `[hidden]:where(:not([hidden="until-found"]))`, and `millionco/react-doctor`'s lint rule carves
  `hidden` out of its boolean-attribute set because it "now also enumerable as `hidden="until-found"`".
  **Consequence for us: `hidden` is not a boolean attribute.** Any SSR/serialization path that treats
  `hidden` as presence-only will silently emit `hidden` where we meant `hidden="until-found"`, and
  the panel stops being find-in-page-discoverable with no visible symptom. That is a real test row
  (§9), and the Astro finding says even the *test tooling* can hide it from you.
- **`beforematch` handling in the wild** — Liveblocks' `Collapsible` primitive is the model:
  ```ts
  const isHiddenUntilFoundSupported = "onbeforematch" in document.body;
  if (!isHiddenUntilFoundSupported) return;
  element.addEventListener("beforematch", handleBeforeMatch);
  ```
  Feature-detect, then listen. Base UI's `useCollapsiblePanel.ts` adds a subtlety worth stealing in a
  comment: `beforematch` "should reveal the matched content immediately, so the next open cycle skips
  author-defined motion once and then returns to normal" — find-in-page reveal must not be animated,
  or the browser scrolls to a panel that is still 0px tall.
- Support, for the record (caniuse, read 2026-08-22): `hidden="until-found"` is **88.79%** global —
  Chrome/Edge 102+, Firefox 148+ (139–147 partial), Safari and iOS Safari **26.2+ partial**, nothing
  before. So on a 2025 iPhone the attribute is inert and the panel is simply hidden. It degrades to
  "closed", which is correct, but it means find-in-page is an enhancement, never a guarantee.

---

## 6. Expected screen-reader behaviour

**Source:** `w3c/aria-at`, test plan `tests/apg/disclosure-faq` (`data/assertions.csv`,
`data/tests.csv`), read 2026-08-22 via the GitHub API. There is a second plan,
`tests/apg/disclosure-navigation`, for disclosure-in-a-navbar; that one belongs to the `navbar`
family, not here. These are community-vetted *assertions* — the information that must be conveyed
and its priority — not verbatim strings; the sequences below turn them into ordered spoken
transcripts using each reader's usual phrasing, so a future transcript test can assert them.
Priority-2/3 assertions are marked `[p2]`/`[p3]`.

The aria-at reference page is a parking FAQ: four disclosure buttons in a `<ul>`, the first named
"What do I do if I have a permit for an assigned lot, but can't find a space there?" and the fourth
"Do all parking facilities have the same enforcement rules?".

**Sequence A — Navigate forwards to a collapsed disclosure button**
(`navForwardsToCollapsedDisclosureButton`)

1. keypress `Tab` (or the reader's next-control command)
2. → "list" `[p3: listBoundary — the `<ul>` wrapper, ours only if the consumer writes one]`
3. → "What do I do if I have a permit for an assigned lot, but can't find a space there?" `[p1]`
4. → "button" `[p1]`
5. → "collapsed" `[p1]`

**Sequence B — Navigate backwards to a collapsed disclosure button**
(`navBackToCollapsedDisclosureButton`) — identical to A with the fourth button's name. The plan
tests both directions because some readers announce state only on forward traversal.

**Sequence C — Navigate to an *expanded* disclosure button**
(`navForwardsToExpandedDisclosureButton` / `navBackToExpandedDisclosureButton`) — A and B with step 5
becoming → "expanded" `[p1]`.

**Sequence D — Request information about the focused button**
(`reqInfoAboutCollapsedDisclosureButton`, VoiceOver `ctrl+opt+f3`/`f4`, NVDA `NVDA+Tab`)

1. → name → "button" → "collapsed" (all `[p1]`). The expanded variant is the same with "expanded".

**Sequence E — Operate a collapsed disclosure button** (`operateCollapsedDisclosureButton`)

1. keypress `Enter` or `Space`
2. → "expanded" `[p1: stateChangeToExpanded]` — **and nothing else is asserted.** aria-at does not
   assert that the panel's content is read, that a region was entered, or that anything was
   announced live. A reader that re-reads the whole button is acceptable; a reader that says nothing
   is a failure.

**Sequence F — Operate an expanded disclosure button** (`operateExpandedDisclosureButton`) — the
mirror: → "collapsed" `[p1]`.

**Sequence G — Navigate from an expanded button into the answer text**
(`navFromExpandedDisclosureButtonToTextQuestionAnswer`)

1. reader's next-item command
2. → "Park at the nearest available parking meter without paying the meter and call 999-999-9999…"
   `[p1: textAnswer1]` — **the panel's text, with no name and no role announced before it.** aria-at
   asserts nothing about the panel element itself. This is the direct evidence that
   `role="region"`/`aria-labelledby` on the panel is not required, and that `aria-live` on an
   ancestor would inject an announcement the plan does not expect.

**NVDA vs VoiceOver, as aria-at records it.** The plan ships `nvda-commands.csv`,
`jaws-commands.csv` and `voiceover_macos-commands.csv` separately. The differences that matter:
NVDA and JAWS reach the buttons in browse mode with quick keys (`b`, `Tab`) and read the
expanded/collapsed state as part of the control announcement; VoiceOver navigates with the VO cursor
(`ctrl+opt+arrow`) and reports state at the end of the control announcement. Unlike the modal-dialog
and tabs plans, **there is no `interactionModeEnabled` assertion anywhere in the disclosure plan** —
a disclosure never switches the reader out of browse mode, which is exactly why it is the cheap,
safe pattern.

**What our implementation must therefore produce, in priority order:** `aria-expanded` correct
before any interaction (Sequences A–D), `aria-expanded` flipped by the time the reader re-reads
(E/F), and the panel's text reachable in DOM order right after the trigger (G). Nothing else in this
family is a priority-1 screen-reader obligation.

---

## 7. Markless API design

### Parts

`collapsible.root`, `collapsible.trigger`, `collapsible.content` — the QDS folder listing exactly.
No indicator (QDS has none, and Ark UI's is pure CSS); no heading wrapper (that is accordion's job,
and accordion is not in the tranche list).

### Types (`collapsible-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type CollapsibleRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the panel is showing. Omit it and the panel starts closed. */
	readonly open?: boolean;
	/** Nothing opens or closes while this is set. */
	readonly disabled?: boolean;
	/**
	 * Leave the closed panel in the page so the browser's find-in-page can reach
	 * the text inside it and open the panel to show a match. Omit it and the
	 * panel is still find-in-page reachable; pass `false` to hide it outright.
	 */
	readonly findInPage?: boolean;
	/** Called with the new value when a person opens or closes the panel. */
	readonly onChange?: (open: boolean) => void;
};

export type CollapsibleTriggerProps = PropsOf<'button'>;

export type CollapsibleContentProps = PropsOf<'div'>;

export type CollapsibleInstanceState = Seeded<
	CollapsibleRootProps,
	'open' | 'disabled' | 'findInPage'
> & {
	onChange?: CollapsibleRootProps['onChange'];
};
```

Notes on the shape:

- **`findInPage` replaces `disableUntilFound`, positively named, default `true`.** Same behaviour as
  QDS, spelled without the double negative, and named after what a person gets rather than after the
  HTML attribute. Base UI/Gutenberg call it `hiddenUntilFound`; that name leaks the mechanism, and
  our conventions already prefer the plain-language surface. **This is a rename, not a behaviour
  change, and it wants a one-line PM confirmation** (§10).
- **No `collapsible` prop.** It is dead in QDS (§2) and it is an accordion concept.
- **No `keepMounted`/`forceMount`/`lazyMount`/`unmountOnExit`.** QDS never unmounts and neither do
  we: the panel is always in the tree and `hidden` decides. Those props exist in other libraries only
  to undo their own unmount default.
- No `defaultOpen`, no `bind:open`, no `hideMode` string: plain `open` + `onChange`, per the
  standing no-controlled/uncontrolled-vocabulary ruling.

### Instance and parts

```tsx
export const collapsibleState = shared(
	() => {
		const collapsible: CollapsibleInstanceState = state({
			open: false,
			disabled: false,
			findInPage: true,
		});
		const triggerEl = element<HTMLButtonElement>();
		const contentEl = element<HTMLDivElement>();

		return {
			...collapsible,
			triggerEl,
			contentEl,
			onChange: undefined as ((open: boolean) => void) | undefined,
			toggle() {
				if (collapsible.disabled) return;
				collapsible.open = !collapsible.open;
				collapsible.onChange?.(collapsible.open);
			},
			reveal() {
				// The browser found text inside the closed panel and is about to
				// show it; follow the browser rather than fight it.
				if (collapsible.open) return;
				collapsible.open = true;
				collapsible.onChange?.(true);
			},
		};
	},
	{ scope: 'widget' },
);

export function CollapsibleRoot({
	open = false,
	disabled = false,
	findInPage = true,
	onChange,
	children,
	...rest
}: CollapsibleRootProps) @{
	const collapsible = collapsibleState();
	collapsible.onChange = onChange;
	collapsible.open = open;
	collapsible.disabled = disabled;
	collapsible.findInPage = findInPage;

	<div
		{...rest}
		ui-open={collapsible.open}
		ui-closed={!collapsible.open}
		ui-disabled={collapsible.disabled}
	>{children}</div>
}

export function CollapsibleTrigger({ children, onClick, ...rest }: CollapsibleTriggerProps) @{
	const collapsible = collapsibleState();

	<button
		{...rest}
		el={collapsible.triggerEl}
		type="button"
		aria-expanded={collapsible.open ? 'true' : 'false'}
		aria-controls={collapsible.contentEl}
		disabled={collapsible.disabled}
		ui-open={collapsible.open}
		ui-closed={!collapsible.open}
		onClick={(event) => {
			collapsible.toggle();
			onClick?.(event);
		}}
	>{children}</button>
}

export function CollapsibleContent({ children, onBeforematch, ...rest }: CollapsibleContentProps) @{
	const collapsible = collapsibleState();

	<div
		{...rest}
		el={collapsible.contentEl}
		hidden={collapsible.open ? undefined : collapsible.findInPage ? 'until-found' : true}
		ui-open={collapsible.open}
		ui-closed={!collapsible.open}
		onBeforematch={(event) => {
			collapsible.reveal();
			onBeforematch?.(event);
		}}
	>{children}</div>
}
```

Everything above uses only landed capabilities. Specifically:

- **`aria-controls={collapsible.contentEl}` is an `element()` handle in an IDREF position, written
  directly, from a part inside the root.** That is the one legal shape: the composite diagnostic
  (`MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE`) refuses lists/joins, the row-owned diagnostic refuses a
  handle bound inside a keyed repeat, and the widget-root diagnostic refuses the *root* reading its
  own factory's handle in an IDREF position — none of which this hits, because the reader is the
  trigger part, not the root. **Collapsible is the first family in the migration where a minted id
  crosses from one part to another**, and it is the simplest possible case: one pair, one instance.
  Contrast tabs, where N pairs under one root is still blocked (`research-tabs.md` §6b).
- **`onChange` fires for real** — the instance-callback route landed (T046 round 3, merged), so the
  checkbox-era "inert callback" caveat does not apply to this family.
- **The consumer's `onClick`/`onBeforematch` compose in an authored closure**, and `{...rest}`
  forwards any *other* consumer function props and `el` handles at link time (T047 + T049b). The
  syntactic forget-guard (`MARKLESS_EVENT_SPREAD_SHADOWED`) requires exactly the destructuring shown.
- **Presence attributes only**: `ui-open`, `ui-closed`, `ui-disabled`. No `ui-qds-collapsible`
  identity attribute (deleted by convention), no `data-*`.

### The one genuinely new question: a three-valued `hidden`

`hidden` is not a boolean. Our content part needs to emit **absent**, **`hidden`**, or
**`hidden="until-found"`** from one expression. Two things must be true and neither is proven in
this tree:

1. The attribute renderer must emit the *string* `until-found` rather than collapsing a truthy value
   to bare presence. §5 shows this is the exact place three separate ecosystems (cheerio, htmlnano,
   a React lint rule) got it wrong.
2. It must survive SSR **and** the CSR mount, identically, and flip correctly across a resume.

The checkbox family's `checked: boolean | 'mixed'` proves a three-valued *cell* works and that
`aria-checked` can carry `'mixed'`. What is unproven here is a three-valued **native boolean-ish
attribute**. This is the family's one framework risk and it should be a red-first test row (§9), not
a discovery during implementation.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| A polymorphic trigger (`<collapsible.trigger as="a">`) | the `as` seam is base-package work and not finalised; also **should refuse `a`** per Roselli (§4) |
| `aria-describedby` on the trigger pointing at both the panel and a hint | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` (U-C, unchartered) |
| An `@if`-armed `collapsible.trigger` that itself roots a nested widget | shared-instance children inside arms still refuse; collapsible has no nested family in v1, so this does not bite here |

### Flippable arms

Collapsible does not need one. `hidden` is an attribute flip, not an arm flip, and keeping the panel
mounted is what makes `hidden="until-found"` work at all. A consumer may of course put a
`collapsible.content` *inside* an `@if` arm; that path is covered by the projected-branch-resume fix
(T045, merged) and by the component-in-arm fix (T043), and it deserves one scenario (§9) precisely
because those two fixes are recent.

---

## 8. Contribution to the overlay-primitive memo

Consolidated in `research-popover.md` §7. Collapsible's contribution is a boundary, stated plainly:

**Collapsible is the inline case and needs nothing from the overlay work.** It has:

- no elevation — the panel is in flow, and that is the entire point of the family;
- no dismiss semantics — no Escape, no outside click, no light dismiss; the trigger is the only way
  in and out, plus find-in-page;
- no focus management — focus never moves on open or close;
- no layering — nothing stacks, nothing is in the top layer;
- no queue or lifecycle — one panel, one boolean.

Its value to the cluster is as the **control**: it exercises open/close, seeds, `onChange`, minted
IDREF wiring, and CSR/SSR/resume for a revealed surface, with zero platform-overlay machinery in the
way. If a collapsible row is red, the defect is in the state/render path, not in elevation. That
makes it the right family to land **first** in tranche 4, before popover — a sequencing
recommendation, not a decision.

One thing collapsible *does* contribute to the memo: it settles that **"content" as a role covers
both the inline and the elevated case** (the standing owner direction), because collapsible's content
and popover's content differ only in elevation and dismissal, not in what the part *is*. That is
visible in the API above: `collapsible.content` and `popover.content` have the same relationship to
their root, the same `ui-open`/`ui-closed` reflection, and the same IDREF role.

---

## 9. Test plan

`packages/headless/components/src/collapsible/collapsible.browser.ts`, scenarios under
`src/collapsible/scenarios/`, per the T059 colocation convention. Part-role testids: `root`,
`trigger`, `content`, prefixed per scenario where several widgets appear.

Scenarios, starter first, special cases last:

1. `collapsible-basic.tsrx` — trigger + content, closed to start.
2. `faq.tsrx` — a realistic FAQ: four collapsibles in a `<ul>`, one open on load, prose in each
   panel. This is the aria-at reference shape (§6) and the one to point a future transcript test at.
3. `disabled.tsrx` — `disabled`, and a disabled root that starts `open`.
4. `no-find-in-page.tsrx` — `findInPage={false}`.
5. `with-onchange.tsrx` / `without-onchange.tsrx` — the callback fires with the new value; omitting
   it still toggles (mirrors the checkbox suite's pair).
6. `two-widgets.tsrx` — two collapsibles on one page; toggling one must not move the other. The
   widget-instance-isolation row.
7. `armed-content.tsrx` — a `collapsible.content` inside an `@if` arm, to keep the T043/T045 fixes
   honest for this family.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| `hidden` is exactly the string `until-found` when closed, in **both** CSR and SSR | §5: three ecosystems normalise this away; SSR is where it will break first |
| `hidden` is absent (not `"false"`, not empty) when open | QDS pins this; the three-valued expression makes it easy to regress |
| `hidden` is the boolean form when `findInPage={false}` | the third value |
| `aria-expanded` is `"false"` before any interaction, `"true"` after | the priority-1 aria-at assertion |
| `aria-controls` on the trigger equals the content's minted `id`, and both are non-empty | the first cross-part IDREF in the migration |
| two co-rendered widgets mint **distinct** ids | pins `element()` per-instance minting |
| `{...rest}` cannot overwrite `aria-expanded` / `hidden` | our spread-first convention, which QDS's root violates |
| a consumer `onClick` on the trigger runs **after** the toggle | the closure-composition contract |
| the root carries **no** `aria-live` | a deliberate, argued deviation from QDS; assert its absence so nobody re-adds it |
| SSR + resume: served HTML has the correct `hidden` and `aria-expanded`, and the first click after resume flips both | the whole point of tranche 4's entry gate |
| dispatching `beforematch` on the closed panel opens it and fires `onChange` | QDS has this row; ours should also assert `onChange`, which QDS's does not |

Mode loop: rows asserting the same thing in CSR and SSR run once per mode with a literal
`render`/`renderSSR` call site each (copy the `MODES` idiom from `checkbox.browser.ts`). Explicit
SSR+resume rows for the served `hidden` value and the first post-resume click.

**Not tested, and why:** real find-in-page (`Ctrl+F`) cannot be driven from vitest browser mode; we
dispatch `beforematch` synthetically, exactly as QDS does, and say so in the parity table. A real
find-in-page row belongs in a manual check or a Playwright lane if one ever exists.

---

## 10. Open questions

1. **`findInPage` vs `hiddenUntilFound` vs QDS's `disableUntilFound`.** Recommended: `findInPage`,
   default `true`. It preserves QDS behaviour and drops the double negative, but it is a public
   prop rename and wants one PM word.
2. **Deleting `aria-live="polite"` from the root.** Recommended: delete, with an
   assert-it-is-absent row. Evidence is in §4 and §6; QDS has a passing test asserting it is present,
   so this is a knowing parity break and belongs in the parity table as "changed, with reason".
3. **Three-valued `hidden` through the SSR renderer** — needs a spike or a red-first row before the
   implementation unit is cut. If the renderer cannot emit `hidden="until-found"`, the honest v1 is
   `findInPage` defaulting to `false` with the prop refused, and that changes item 1's answer.
4. **`role="region"` on the panel.** Recommended: not set by us. Confirm, since it is very common in
   the wild (§5) and will be the first thing an experienced consumer asks about.
5. **Landing order within tranche 4.** Recommended: collapsible first, then popover+modal, then
   tooltip, then toast — cheapest-to-hardest, and collapsible is the control that isolates the
   state/render path from the elevation path (§8).
6. **`accordion` is out of scope but keeps showing up** (§1, §5). Not a request to add it; a request
   to record that the collapsible API above is accordion-compatible, so a later accordion family
   wraps it rather than forking it.
