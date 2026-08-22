# Tooltip — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference:** **there is no `tooltip` folder in QDS.** The full family list under
`~/dev/open-source/qwik-design-system/libs/components/src/` is: button, calendar, carousel, checkbox,
checklist, collapsible, date-input, file-upload, label, menu, modal, navbar, otp, pagination,
popover, progress, qr-code, radio-group, render, resizable, scroll-area, select, slider, table, tabs,
textbox, toggle, tree, visually-hidden. §2 documents what exists instead and treats it as the
reference, per the packet's blocked-permission clause.
**Markless facts read from:** the shared checkout on `feat/headless-ui-pilot` (session snapshot head
`7c87ecf5`).

**Cluster note.** The shared overlay-primitive requirements memo lives in `research-popover.md` §7.
Tooltip's contribution to it is §8 below. Tooltip is the family with the **largest gap between what
libraries ship and what accessibility research says is correct**, so §4 is unusually long and §7 is
unusually conservative on purpose.

---

## 1. Name and alternates

Searched under: tooltip, toggletip, hint, hover card, preview card, popup label, title attribute,
help text, infotip, interest invoker.

- **Tooltip** is the settled name: Base UI, Ark UI, Radix, Kobalte, Ariakit, Bits UI, React Aria,
  Corvu, Melt, Headless UI (via `Popover`), Dice UI. It is also becoming a *platform* name —
  `popover="hint"` is described by MDN as being "for tooltips and hover/focus popovers".
- **Toggletip** is the important alternate and it is a **different component**. Heydon Pickering's
  *Inclusive Components* coined the split and Sarah Higley's write-up formalises it: a **tooltip** is
  revealed by hover/focus and *describes* the control it hangs off; a **toggletip** is revealed by a
  click on a dedicated button and its content is *announced*, usually via a live region. They have
  different ARIA, different keyboard behaviour, and different failure modes. Everything in this
  document is about tooltips. A toggletip in our library is `popover.root` + a button + a small
  amount of consumer markup, and should be documented as a recipe rather than shipped as a family.
- **Hover card / preview card** — a *popover* opened by hover with rich, interactive content (a
  GitHub user card). Radix and Base UI ship it separately; QDS folds the hover machinery into
  `popover` via `hover`/`delay`/`closeDelay`/`hoverGroup`. **It is not a tooltip**, because a tooltip
  is text-only and non-interactive (§4). Ours is `popover.root hover`, already covered by
  `research-popover.md` §8a.
- **The `title` attribute** is the platform's tooltip and every expert source surveyed says do not
  use it: it is not keyboard-reachable, not touch-reachable, not stylable, not dismissible, and
  duplicates or fights the accessible name. Sarah Higley lists it under "Avoid".
- **Interest invokers (`interestfor`)** is the emerging platform proposal for exactly this pattern —
  a declarative "show this element when the user shows interest in that control", with a CSS
  `interest-delay`. See §5; it is not shippable yet but it is the shape the platform is heading for,
  and it changes what our API should *not* foreclose.
- **Alternative-named implementations** worth crediting:
  - **`microsoft/vsts-extension-retrospectives`** ships production tooltips as
    `<div popover="hint" role="tooltip">` + `interestFor` + `aria-describedby` on the trigger — the
    most modern shape found anywhere, using both the hint stack and interest invokers.
  - **`getsentry/sentry`'s `useHoverOverlay`** has a dedicated timing spec file, which is a good
    signal that hover timing is where tooltip bugs live.

**Recommendation: name it `tooltip`.** There is no QDS name to match, and every library agrees.

---

## 2. What exists in QDS instead

There is no tooltip family. What QDS has is the **hover-intent machinery**, built for `popover` and
reusable by a tooltip. It is worth reading closely because it is the part a tooltip cannot avoid.

```
popover/hooks/use-popover-hover.ts
popover/math/hover-delay.ts        popover/math/hover-delay.unit.ts
popover/math/safe-polygon.ts       popover/math/safe-polygon.unit.ts
```

`popover-root.tsx` exposes four props that feed it: `hover`, `delay`, `closeDelay`, `hoverGroup`.

**`use-popover-hover.ts`** — `handleIn$`/`handleOut$` on the *root* (so the trigger and content share
one hover region), with:

- `if (e.pointerType === "touch") return;` — **hover is disabled on touch, at the event level.** This
  matches Base UI's stance ("there's no easily discoverable way to reveal a tooltip before tapping").
- open after `delay` ms (default 200) via `window.setTimeout`;
- on pointer-out, after `closeDelay` ms, start a `SafePolygonTracker` rather than closing;
- cleanup clears the pending timeout and stops the tracker.

**`math/safe-polygon.ts`** — a genuinely nice piece of work, 141 lines, no dependencies:
`isPointInPolygon` (ray casting), `isInsideRect` with a buffer, `convexHull` (monotone chain),
`getSafeZone` (the hull of the trigger rect and the content rect, each inflated by 10px), and a
`SafePolygonTracker` class that listens to `pointermove` on `document`, throttled to 16ms, and calls
`onClose` when the cursor leaves the hull. **This is the "hoverable" half of WCAG 1.4.13** (§4) done
properly — the user can move diagonally from trigger to content without the tooltip vanishing.

**`math/hover-delay.ts`** — 14 lines. A `HoverGroup` is `{ openCount, delay, switchDelay }`;
`getEffectiveDelay` returns the item's own delay if set, else `switchDelay` (default 137.5ms) if any
group member is already open, else `delay` (default 200ms). **This is the "once one is open, the
next opens instantly" behaviour** that Base UI calls `Provider.timeout` (400ms) and Radix calls
`skipDelayDuration` (300ms). QDS implements it as a shared counter rather than a timer, which is the
simpler formulation.

Both math modules are **plain functions with unit tests and no framework imports**, so they port to
Markless as ordinary TypeScript with their `*.unit.ts` suites intact. That is the single largest
piece of free work available in this cluster, and T001 §4 already flagged it.

**What QDS does not have, and we would be writing from nothing:** `role="tooltip"`,
`aria-describedby` wiring, the focus trigger (tooltips open on focus, popovers do not), Escape
dismissal separate from light dismiss, and the touch story.

---

## 3. Headless library survey

Fetched 2026-08-22.

| Library | Parts | Open delay | Close delay | Hoverable content | Skip/group |
| --- | --- | --- | --- | --- | --- |
| **Base UI** (v1.7.x) | `Provider`, `Root`, `Trigger`, `Portal`, `Positioner`, `Popup`, `Arrow`, `Viewport` | `Trigger.delay: 600` | `Trigger.closeDelay: 0` | on by default; `Root.disableHoverablePopup: false` | `Provider.timeout: 400` |
| **Ark UI** (Zag) | `Root`, `Trigger`, `Positioner`, `Content`, `Arrow`, `ArrowTip` | `openDelay: 400` | `closeDelay: 150` | `interactive: false` | via the machine's shared store |
| **Radix UI** | `Provider`, `Root`, `Trigger`, `Portal`, `Content`, `Arrow` | `delayDuration: 700` | — | `disableHoverableContent` | `skipDelayDuration: 300` |
| **Kobalte** | `Root`, `Trigger`, `Portal`, `Content`, `Arrow` | `openDelay: 700` | `closeDelay: 300` | yes | shared "safe to skip" state |
| **Ariakit** | `TooltipProvider`, `TooltipAnchor`, `Tooltip`, `TooltipArrow` | `timeout` | `hideTimeout` | yes | `skipTimeout` |
| **React Aria** | `TooltipTrigger`, `Tooltip` | `delay: 1500`, `closeDelay: 500` | | yes | global "warmup/cooldown" |
| **Bits UI** | `Provider`, `Root`, `Trigger`, `Portal`, `Content`, `Arrow` | `delayDuration` | | `disableHoverableContent` | `skipDelayDuration` |
| **QDS** | *(none — `popover hover` instead)* | `delay: 200` | `closeDelay: 0` | safe polygon, always | `hoverGroup.switchDelay: 137.5` |

Consensus and disagreement:

- **Everyone has a `Provider`/group concept** for the skip-delay behaviour. QDS's `hoverGroup` is
  the same idea passed explicitly as a value rather than through context — which is *better* for us,
  because a provider component is a context primitive and we do not have one, while a plain value
  threaded through a prop is expressible today.
- **Open delay defaults vary by 2.5×** — 400 (Ark), 600 (Base UI), 700 (Radix, Kobalte), 1500 (React
  Aria). There is no consensus number. React Aria's 1500ms is the outlier and is the one grounded in
  a stated principle (avoid accidental reveal on pass-through).
- **`role="tooltip"` is *not* set by Base UI.** A production codebase (`mastra-ai/mastra`) adds it
  back manually with a comment: *"Base UI's Popup omits `role='tooltip'` by default (only the trigger
  gets `aria-describedby`). Radix used to set it on Content, and our consumers query via
  `getByRole('tooltip')`, so set it explicitly."* That is a live disagreement between two tier-1
  libraries about the pattern's central attribute, and §4 says who is right.
- **Tab behaviour is a real split.** Radix and Ark both document `Tab` as "opens/closes the tooltip
  without delay" — i.e. keyboard focus opens it immediately, skipping the hover delay. Base UI says
  focus opens it. Everyone agrees Escape closes.
- **Touch:** Base UI disables tooltips on touch devices outright. QDS's hover hook returns early on
  `pointerType === "touch"`. Nobody has a good touch story, and the honest position is that a
  tooltip is a pointer-and-keyboard affordance.
- **Ariakit's documented rule is the one to steal for our docs:** the anchor "must have an accessible
  name" of its own, and should render "an accessible widget through composition, like a button or a
  link, so it's properly announced". Tooltips supplement a name; they never *are* the name — unless
  you deliberately use `aria-labelledby` (§4).

---

## 4. WAI-ARIA, WCAG, and expert commentary

### APG — Tooltip (`w3.org/WAI/ARIA/apg/patterns/tooltip/`)

**The page opens with a warning, quoted:** *"This design pattern is work in progress; it does not yet
have task force consensus."* That is unusual and it should be quoted in our own docs. It means the
tooltip pattern is the one place in this migration where the APG is explicitly not authoritative.

What it does say:

- Keyboard: *"Escape: Dismisses the Tooltip."* Focus stays on the trigger while the tooltip shows;
  it dismisses on blur when opened by focus; it stays open while the cursor is over either the
  trigger or the tooltip.
- Roles/properties: the container has `role="tooltip"`; the trigger references it with
  `aria-describedby`.

### WCAG 2.1 SC 1.4.13 — Content on Hover or Focus

This is the criterion tooltips are graded against, and Sarah Higley's write-up states the three
properties:

1. **Dismissable** — the user can hide it without moving the pointer or focus. Escape for keyboard;
   for pointer, Escape also works or a close affordance.
2. **Hoverable** — *"Allow a mouse user to move their mouse over the tooltip content without
   dismissing the tooltip"*, which she notes matters for zoom users and users with precision control
   difficulties. **This is what QDS's safe polygon implements.**
3. **Persistent** — it stays visible until dismissed or no longer valid. **No timeouts.**

### Sarah Higley, *Tooltips in the time of WCAG 2.1* — the load-bearing findings

Her narrowed definition, quoted: *"A 'tooltip' is a non-modal (or non-blocking) overlay containing
text-only content that provides supplemental information about an existing UI control."*

Four findings that change our API:

1. **`role="tooltip"` does approximately nothing.** Quoted: it *"does not appear to affect screen
   reader announcements in any meaningful way"* — the semantic association (`aria-describedby`)
   carries the announcement. This resolves the Base UI / Radix disagreement in §3: **Base UI is
   arguably right that the role is inert, and Radix is right that the ecosystem expects it.** Cost of
   setting it is zero and it is what `getByRole('tooltip')` finds; recommendation is to set it, and
   to document that the description is what actually does the work.
2. **`aria-describedby` for hints; `aria-labelledby` when the tooltip *is* the name** of an icon-only
   button. Two genuinely different cases, and only the consumer knows which they are in.
3. **Avoid `aria-haspopup`, `aria-live`, and the `title` attribute.** All three are listed explicitly
   under "Avoid". A tooltip must not be a live region.
4. **Content must be text-only, non-interactive, supplemental, and untimed.** Essential information
   does not go in a tooltip. This is what rules out a `close` part and any interactive content, and
   it is why hover cards are a different family (§1).

### Adrian Roselli — `interestfor`, and the "no hover-reveal" rule

His *Disclosure Widgets* post carves out exactly one exception to "do not reveal content on hover or
focus": tooltips. So the tooltip is the *only* family in this cluster allowed to open on hover, and
that permission does not extend to popover or collapsible.

### The consequence nobody states plainly

Every property above is about **not being a dialog**: no focus movement, no trap, no modality, no
interactivity, no live announcement, no timeout. A tooltip is the *least* powerful overlay in the
cluster and the one with the most rules. The API should be correspondingly small — three parts, no
close button, no interactive content — and it should be *hard* to build a hover card out of it.

---

## 5. GitHub patterns (grep MCP)

Searches whose tooltip-relevant hits are recorded here: `role="tooltip"` (TSX), `popover="hint"`
(TSX/TS/HTML), `interestfor=` (TSX/TS/HTML), `safePolygon(` (TSX/TS), plus the cluster sweeps
`popover="auto"`, `popovertarget=`, `onBeforeToggle`, `anchor-name:`.

- **`role="tooltip"` is ubiquitous and almost always on a `<div>`/`<span>` that is *not* referenced by
  `aria-describedby`** — mkdocs-material's `renderTooltip`, `aden-hive/hive`'s `Tooltip.tsx` (which
  portals to the cursor position), Sentry's timing spec, Fluent UI's Cypress suites, LibreChat's
  `MessageNav` tests. The role is being used as a **query selector**, not as semantics. That is the
  practical reason to keep setting it even though Higley says it is inert (§4).
- **`popover="hint"` is in production today**, not just in specs: MetaMask's
  `transaction-status.tsx` (`popover="hint"` + `[position-area:bottom]` in a Tailwind class, with a
  `// @ts-expect-error We need to update React types`), `microsoft/vsts-extension-retrospectives`
  (three tooltips), Umbraco's `entity-sign-bundle.element.ts`, OpenProject's calendar
  (`<anchored-position popover="hint" role="dialog">`), and MDN's own `dom-examples/popover-api/
  popover-hint`. WPT has a `popover-hint-hierarchy.html` test for the auto/hint stack separation, and
  the HTML validator's `popover-isvalid.html` covers it. **The hint stack is real and shippable.**
- **`interestfor` is the emerging platform primitive for this exact pattern.** WPT carries a whole
  `html/semantics/interestfor/` directory (basic behavior, keyboard behavior, keyboard invalidation,
  invoker descendants, pseudo-element appearance, anchor event dispatch, input invalid) linking to
  `open-ui.org/components/interest-invokers.explainer`. It works on `<button>`, `<a>`, `<area>`, SVG
  `<a>`, and `<menuitem>`; it dispatches `interest`/`loseinterest` events; and **the delay is a CSS
  property**, `interest-delay`, which the WPT files set to `0s` to make tests deterministic. MDN
  ships `dom-examples/interest-invokers/` samples. Production use already exists
  (`vsts-extension-retrospectives` pairs `interestFor` with `aria-describedby` and
  `popover="hint"` — belt, braces, and the future).
  **Consequence for our API: do not build anything that a later `interestfor` would have to fight.**
  Specifically, do not put the hover machinery on the *content*; keep it on the trigger, which is
  where `interestfor` lives.
- **`safePolygon` is a Floating UI concept that the ecosystem has standardised on** — Grafana uses
  it in three places (`Tooltip.tsx` gates it on `interactive`), Mattermost in three
  (with `requireIntent` and `blockPointerEvents` options), Mantine's Cascader, difit's quick menu,
  and Base UI vendors Floating UI's `safePolygon` into
  `packages/react/src/floating-ui-react/safePolygon.test.ts`. **Bits UI wrote their own**
  (`internal/safe-polygon.svelte.ts`) with a triangular/trapezoidal zone from the *exit point* to the
  target, which is a slightly different (and arguably better) formulation than QDS's convex hull of
  both rects. Worth a look if QDS's hull proves too permissive.
- **Grafana's `Tooltip.tsx` is the clearest statement of the split**:
  `handleClose: interactive ? safePolygon() : undefined` — the safe polygon is only needed when the
  content is hoverable, and hoverability is a prop. For us, WCAG 1.4.13 says hoverable is not
  optional, so the polygon is not optional either.
- **Anti-pattern seen repeatedly:** tooltips rendered into `document.body` at cursor coordinates
  (`aden-hive/hive`, `BuilderIO/agent-native`'s chart tooltip asserting
  `document.body.querySelectorAll('[role="tooltip"]')`). Cursor-following tooltips cannot satisfy
  "hoverable" — the content moves away from the pointer. Base UI's `trackCursorAxis` exists for
  charts specifically; **we should not ship it**, and chart tooltips should be documented as a
  different problem.

---

## 6. Expected screen-reader behaviour

**There is no `w3c/aria-at` test plan for tooltips.** The full APG plan list (read 2026-08-22) has
`accordion, alert, banner, breadcrumb, checkbox-tri-state, checkbox, combobox-autocomplete-both-
updated, combobox-select-only, command-button, complementary, contentinfo, disclosure-faq,
disclosure-navigation, form, horizontal-slider, link-css, link-img-alt, link-span-text, main,
menu-button-actions-active-descendant, menu-button-actions, menu-button-navigation, menubar-editor,
meter, minimal-data-grid, modal-dialog, quantity-spin-button, radiogroup-aria-activedescendant,
radiogroup-roving-tabindex, rating-radio-group, rating-slider, seek-slider, slider-multithumb,
switch-button, switch-checkbox, switch, tabs-automatic-activation, tabs-manual-activation,
toggle-button, vertical-temperature-slider` — no tooltip. Given the APG's own "does not yet have task
force consensus" warning (§4), that absence is consistent, not an oversight.

**So the sequences below are derived from ARIA semantics and expert findings, and are explicitly not
community-vetted.** They are still worth writing, because they are what a transcript test would
assert and because writing them exposes the design choices. Take a "Save" icon-only button whose
tooltip reads "Save draft".

**Sequence A — Tab to a trigger with `aria-describedby` → tooltip** (the hint case)

1. keypress `Tab`
2. → "Save" — the trigger's own accessible name, from its content or `aria-label`
3. → "button"
4. → "Save draft" — **the description.** Readers announce descriptions after name and role, and
   **most respect a verbosity setting that can suppress them**, which is Higley's stated reason to
   prefer `aria-describedby` for hints: the user is in control.
5. → *nothing about a tooltip*. `role="tooltip"` contributes no announcement (§4 finding 1).

**Sequence B — Tab to a trigger with `aria-labelledby` → tooltip** (the icon-button case)

1. keypress `Tab`
2. → "Save draft" — the tooltip text **is** the name
3. → "button"

The choice between A and B is the consumer's and cannot be guessed by the library. §7 makes it a
prop.

**Sequence C — Escape while the tooltip is showing**

1. keypress `Escape`
2. → nothing is announced. The tooltip disappears visually; the description is still attached to the
   trigger and would be re-read on refocus.

This is worth writing down because it is a place implementers over-engineer: WCAG's "dismissable"
requirement is about the **visual** overlay obscuring content, not about the announcement. Do not add
a live region to announce dismissal (Higley: avoid `aria-live`).

**Sequence D — Hover with no keyboard involvement** — no announcement at all. A screen-reader user
who is not also a mouse user never triggers the visual tooltip; they get the description in Sequence
A regardless of whether the visual tooltip ever showed. **That is the point of `aria-describedby` and
it is why the visual and the announced paths must not be coupled.** An implementation that only sets
`aria-describedby` while the tooltip is *open* breaks this — and several libraries do exactly that.
**Recommendation: the trigger's `aria-describedby` is permanent, not conditional.**

**Reader differences.** Descriptions are the most inconsistently-handled ARIA feature across
NVDA/JAWS/VoiceOver: NVDA reads them by default and has a verbosity toggle; JAWS reads them in some
modes; VoiceOver announces them after a pause and can be configured off. There is no vetted source to
pin exact strings against, so a transcript test for this family should assert **that the description
text is conveyed at all**, not its position in the utterance.

---

## 7. Markless API design

### Parts

`tooltip.root`, `tooltip.trigger`, `tooltip.content`. Three, matching the QDS popover shape (which is
the closest thing to a QDS precedent) and the minimum every library agrees on. **No arrow part**
(CSS, per the standing elevation ruling), **no close part** (a tooltip has no interactive content),
**no provider part** (we have no context primitive, and the group is a value — see below).

### Types (`tooltip-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

/** Shared between tooltips so that once one has opened, its neighbours open at once. */
export type TooltipGroup = {
	openCount: number;
	/** How long a first tooltip waits, in milliseconds. */
	delay: number;
	/** How long a neighbouring tooltip waits once one is already showing. */
	switchDelay: number;
};

export type TooltipRootProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** Whether the tooltip is showing. Omit it and it starts hidden. */
	readonly open?: boolean;
	/** How long a pointer rests on the trigger before the tooltip shows. */
	readonly delay?: number;
	/** How long the tooltip waits after the pointer leaves before it hides. */
	readonly closeDelay?: number;
	/** Nothing shows while this is set. */
	readonly disabled?: boolean;
	/**
	 * The tooltip text is the trigger's name rather than extra detail about it.
	 * Set it when the trigger shows only an icon.
	 */
	readonly namesTrigger?: boolean;
	/** Tooltips sharing one of these open instantly once any of them is showing. */
	readonly group?: TooltipGroup;
	readonly onChange?: (open: boolean) => void;
};

export type TooltipTriggerProps = PropsOf<'button'>;
export type TooltipContentProps = PropsOf<'div'>;

export type TooltipInstanceState = Seeded<
	TooltipRootProps, 'open' | 'delay' | 'closeDelay' | 'disabled' | 'namesTrigger'
> & {
	group?: TooltipGroup;
	onChange?: TooltipRootProps['onChange'];
};
```

Shape notes:

- **`namesTrigger` is the `aria-describedby`-vs-`aria-labelledby` switch**, in plain language and
  named after the situation rather than the attribute. Default `false` (describe). This is Higley's
  finding 2 made into one boolean instead of asking consumers to wire ARIA by hand.
- **`group` is a plain value, not a provider component.** QDS already proves the shape
  (`hoverGroup: HoverGroup`), it needs no context primitive, and a consumer creates one with
  `state({ openCount: 0, delay: 200, switchDelay: 137.5 })` and passes it to each root. Whether that
  survives being a shared mutable object read by several widget instances is §10 question 4.
- **No `interactive`/`disableHoverablePopup`.** WCAG 1.4.13's "hoverable" is not optional, so the
  safe polygon always runs. That is a deliberate divergence from Ark UI (`interactive: false`) and
  Radix (`disableHoverableContent`).
- **No `trackCursorAxis`** (§5 anti-pattern), no `timeout`/auto-hide (1.4.13 "persistent"), no
  `closeOnClick` default of `true` (Base UI has it; it fights "persistent" — see §10 q5).
- Default `delay`: **600ms**, matching Base UI, sitting between Ark's 400 and Radix's 700, and well
  short of React Aria's 1500. No consensus exists, so this is a defensible pick, not a derived one.

### Parts

```tsx
export const tooltipState = shared(
	() => {
		const tooltip: TooltipInstanceState = state({
			open: false, delay: 600, closeDelay: 0, disabled: false, namesTrigger: false,
		});
		const contentEl = element<HTMLDivElement>();

		return {
			...tooltip,
			contentEl,
			group: undefined as TooltipGroup | undefined,
			onChange: undefined as ((open: boolean) => void) | undefined,
			settle(open: boolean) {
				if (tooltip.open === open) return;
				tooltip.open = open;
				tooltip.onChange?.(open);
			},
		};
	},
	{ scope: 'widget' },
);

export function TooltipTrigger({ children, onPointerenter, onPointerleave, onFocus, onBlur, ...rest }: TooltipTriggerProps) @{
	const tooltip = tooltipState();

	<button
		{...rest}
		type="button"
		aria-describedby={tooltip.namesTrigger ? undefined : tooltip.contentEl}
		aria-labelledby={tooltip.namesTrigger ? tooltip.contentEl : undefined}
		ui-open={tooltip.open}
		onPointerenter={(event) => { hoverIn(tooltip, event); onPointerenter?.(event); }}
		onPointerleave={(event) => { hoverOut(tooltip, event); onPointerleave?.(event); }}
		onFocus={(event) => { showNow(tooltip); onFocus?.(event); }}
		onBlur={(event) => { hideNow(tooltip); onBlur?.(event); }}
	>{children}</button>
}

export function TooltipContent({ children, ...rest }: TooltipContentProps) @{
	const tooltip = tooltipState();

	<div
		{...rest}
		el={tooltip.contentEl}
		role="tooltip"
		popover="hint"
		overlay
		ui-open={tooltip.open}
		ui-closed={!tooltip.open}
	>{children}</div>
}
```

`hoverIn`/`hoverOut`/`showNow`/`hideNow` are plain module functions — the ported QDS hover hook, with
`getEffectiveDelay` and `SafePolygonTracker` moving over as plain TypeScript with their `*.unit.ts`
suites (§2).

Design notes, and the two hard parts:

- **`popover="hint"` rather than `"auto"`.** This is the whole reason the tooltip is a separate
  family and not a popover with a role: a `hint` closes other hints but **does not close open `auto`
  popovers**, so hovering a button inside an open dropdown does not dismiss the dropdown. That is the
  exact bug Roselli documents for popover-over-dialog (`research-popover.md` §4), one layer down.
  `hint` also degrades to `manual` in browsers that do not know it, which means *no light dismiss* —
  our Escape/blur handling must therefore be ours, not the platform's. **Do not rely on light dismiss
  for tooltips.**
- **`aria-describedby` / `aria-labelledby` is permanent, not conditional** (§6 Sequence D). It
  points at the content's minted id whether or not the tooltip is showing. That is legal today: one
  `element()` handle, one IDREF position, read from a part inside the root. The ternary above is
  *between two attributes*, not a composite IDREF, so `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` does
  not fire — **but a ternary in an IDREF position is unproven and must be checked** (§10 q2). If it
  refuses, the fallback is two arms or two content variants, both uglier.
- **The content is never unmounted** (`research-popover.md` §7.2, R4).
- **`overlay` is stamped and inert**, same as popover.
- **Escape** is not shown above. It cannot live on the trigger's `onKeydown` alone if focus has moved,
  and a document-level listener is not something a part can install without a behavior. §10 q3.

### The delay problem (R13)

Everything about a tooltip is timers: open after `delay`, close after `closeDelay`, group
`switchDelay`, and the safe-polygon tracker's `pointermove` subscription. None of that exists in any
shipped Markless family. Specifically unproven:

1. **`window.setTimeout` inside a handler.** Should be plain JS, but nothing proves it.
2. **Clearing a pending timeout when the widget goes away.** QDS clears it in `cleanup`. We have no
   unmount hook, and per doctrine we are not adding one. If the trigger is inside an `@if` arm that
   flips, a pending `setTimeout` fires against a gone instance.
3. **`document.addEventListener('pointermove', …)`** for the safe polygon, and removing it. Same
   problem, larger blast radius — a leaked document listener running convex-hull maths on every
   pointer move is a real performance bug.
4. **SSR resume.** A tooltip is never open in served HTML, so there is no *state* to restore — but a
   timer started before a resume, or a hover that begins mid-resume, is untested territory.

**This is tooltip's blocking risk and it should be priced before the implementation unit**, the same
way U-M was priced for tabs. The `attach` behavior vocabulary is the obvious home for (2) and (3) —
a behavior that owns the listener and the timer, with the framework owning its teardown — and that
is *existing* vocabulary, not a new API. §10 q3 asks for that ruling.

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| A document-level `pointermove`/`keydown` listener with framework-owned teardown | needs the `attach` behavior seam, unproven for this shape |
| A timer that is abandoned when the widget goes away | no unmount hook, by doctrine |
| `aria-describedby` pointing at both the tooltip and other help text | `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` (U-C) |
| A `TooltipGroup` shared across widget instances | plain object shared by prop; unproven for reactivity (§10 q4) |

---

## 8. Contribution to the overlay-primitive memo

Consolidated in `research-popover.md` §7. Tooltip's contributions:

1. **The hint stack is a distinct platform requirement, not a variation of `auto`.** A tooltip that
   used `popover="auto"` would dismiss the dropdown it lives inside. `popover="hint"` exists
   precisely for this, closes only other hints, and is in production use today (§5). Requirement R6
   (layering between kinds) therefore has *three* tiers on the web — hint, auto, dialog — and the
   platform is the only thing that implements the ordering between them.
2. **Light dismiss is *not* available to tooltips.** `hint` degrades to `manual` where unsupported,
   and even where supported, "click outside" is the wrong dismissal for something that opens on
   hover. Requirement R5 is therefore **not met by the platform for tooltip** — Escape and blur are
   ours. That is a distinction the memo must carry, because it is the one family where the
   platform-first answer is incomplete.
3. **Timers and pointer tracking (R13) are the cluster's most under-proven need**, and tooltip is
   where they land hardest: four separate timing behaviours, a document-level listener, and no
   unmount hook. Toast has the same need in a simpler form. If one framework spike is funded for this
   cluster, it should be this one.
4. **Interest invokers (`interestfor` + CSS `interest-delay`) are the platform's answer to *all* of
   the above** — declarative hover/focus intent with a CSS-configured delay and framework-free
   teardown. It is not shippable (WPT tests are `.tentative.html`, Chromium-only in practice), but it
   is far enough along to have production users. **The memo's forward-looking note:** keep the hover
   machinery on the trigger, so that the day `interestfor` ships, the trigger grows one attribute and
   the hand-written timers are deleted. Do not architect anything that would make that a rewrite.
5. **Tooltip needs anchored positioning (R8) exactly as much as popover does**, and it is *more*
   sensitive to it, because a mispositioned tooltip that lands under the cursor breaks the "hoverable"
   requirement outright.

---

## 9. Test plan

`packages/headless/components/src/tooltip/tooltip.browser.ts`, plus **plain-Vitest unit suites** for
the ported maths: `tooltip/math/safe-polygon.unit.ts` and `tooltip/math/hover-delay.unit.ts`, carried
over from QDS with their assertions intact (they need no DOM beyond `DOMRect`-shaped objects).

Scenarios under `src/tooltip/scenarios/`: `tooltip-basic.tsrx`, `icon-button.tsrx`
(`namesTrigger`, the accessible-name case), `toolbar.tsrx` (five triggers sharing one `group` — the
realistic case and the group test), `disabled.tsrx`, `two-tooltips.tsrx`.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| trigger's `aria-describedby` equals the content's minted id **while the tooltip is closed** | §6 Sequence D: the announcement path must not depend on the visual path. The row most implementations fail |
| `namesTrigger` swaps it to `aria-labelledby` and removes `aria-describedby` | one attribute at a time, never both |
| content has `role="tooltip"` and `popover="hint"` | asserted, not assumed; `hint` is the layering contract |
| focus on the trigger shows it **with no delay**; pointer-enter shows it only after `delay` | the documented Tab-skips-the-delay behaviour |
| blur hides it; Escape hides it while focus stays on the trigger | WCAG 1.4.13 dismissable |
| moving the pointer from trigger into the content does **not** hide it | WCAG 1.4.13 hoverable — the safe polygon's reason to exist |
| moving the pointer away from both hides it after `closeDelay` | the other half |
| **it never hides on its own** — with the tooltip open and no interaction, it is still open after a long wait | WCAG 1.4.13 persistent. A regression here is silent |
| a `group` shared by two tooltips: the second opens at `switchDelay`, not `delay` | the group behaviour, and the shared-value question |
| `pointerType: 'touch'` does not open it | QDS's own guard, and the whole industry's position |
| a tooltip open inside an open `popover.content`: **the popover does not close** | the hint-vs-auto stack, and the single best justification for the family being separate |
| leaving the page/arm with a pending open timer does not throw | the R13 teardown risk, red-first if needed |
| SSR: served HTML has the content present, closed, with the IDREF wired | resume parity |
| two co-rendered tooltips mint distinct ids | instance isolation |

**Not tested, and why:** exact announcement strings (no aria-at plan, §6) — assert attributes, not
utterances. Anchor positioning (CSS, one Chromium). Real touch input.

---

## 10. Open questions

1. **Ship a tooltip family at all, given the APG says the pattern lacks consensus?** Recommended:
   yes — it is on the owner-agreed tranche list, every library ships one, and shipping a *correct*
   one (permanent description, hoverable, persistent, no live region) is more valuable than leaving
   consumers to hand-roll the versions §5 found in the wild. But the "work in progress" warning
   belongs verbatim in our docs.
2. **A ternary between `aria-describedby` and `aria-labelledby`, both taking the same `element()`
   handle** — legal, or does the IDREF checker refuse an attribute chosen at render time?
   Unproven, cheap to probe, and it decides whether `namesTrigger` is one prop or two content parts.
3. **Where do the document-level listener and the timers live?** Recommended: an `attach` behavior on
   the trigger that owns the `setTimeout` handles and the `pointermove` subscription, so teardown is
   the framework's rather than needing an unmount hook. That uses existing vocabulary but has never
   been done for this shape. **This is the tranche's most valuable spike.**
4. **Is a plain shared `TooltipGroup` object reactive across widget instances?** QDS uses a Qwik
   signal in `openCount`. Ours would be a `state()` object created by the consumer and passed to
   several roots. Whether writes from one instance are seen by another's read is exactly the
   cross-instance question the framework has not been asked before.
5. **`closeOnClick`.** Base UI defaults it `true` (clicking the trigger hides the tooltip). It
   arguably fights "persistent", and it matters because a tooltip trigger is usually also a button
   that does something. Recommended: hide on click, because the click's own result (a dialog, a
   navigation) makes a stale tooltip wrong — but state it as a chosen behaviour, not a default
   inherited from Base UI.
6. **Default `delay`.** 600ms proposed. The spread across libraries is 400–1500 with no consensus and
   React Aria's outlier is the only principled one. Worth one PM word rather than a silent pick.
7. **Toggletip.** Recommended: document it as a recipe over `popover`, do not ship a family. Confirm,
   since it is the pattern people actually need for "explain this term" and its absence will be
   noticed.
