# Scroll Area — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/scroll-area/` (READ-ONLY)
**Markless facts read from:** this worktree, cut from `feat/headless-ui-pilot` @ `30c5f92f`.
Framework-limit statements are quoted from `packages/headless/components/src/checklist/note.md`.

**The frame, stated first.** Every other family in this package is a widget that needs JavaScript to
exist. This one is not. A scroll area is a `div` with `overflow: auto`, and the browser has shipped
it since 1996. The whole question is **how much of the custom-scrollbar machinery still has to be
JavaScript in 2026**, and the answer this document reaches is: the keyboard and naming half is
markup, the appearance half is CSS, the thumb's *position* is CSS, and the only thing left needing a
listener is a thumb **drag** — three handlers on one element, and **zero document-level listeners**,
which is a strict improvement on every implementation surveyed.

**Cluster note.** One of four documents for tranche 5 (otp, pagination, scroll-area, qr-code). The
cluster's consolidated framework asks are in `research-pagination.md` §8; scroll-area's contribution
is §8 below, and like collapsible's in tranche 4 it is mostly negative.

---

## 1. Name and alternates

Searched under: scroll area, scrollarea, scroll container, scroller, custom scrollbar, overlay
scrollbars, simplebar, perfect-scrollbar, viewport, scroll view, overflow container.

- **Scroll Area** is the settled headless name: QDS `scroll-area`, Base UI `ScrollArea`, Radix
  `ScrollArea`, Ark UI `ScrollArea`, Bits UI `ScrollArea`. Nobody ships it under another name.
- **"Custom scrollbar" libraries are the older lineage and the honest competition**: SimpleBar,
  perfect-scrollbar, OverlayScrollbars, `react-custom-scrollbars`. They predate `scrollbar-width`
  and `scrollbar-color` and exist because Firefox had no scrollbar styling at all. Their reason for
  existing has substantially expired (§4).
- **Virtualisation is a different family** (TanStack Virtual, react-window). A scroll area does not
  windowing; if a consumer needs 100,000 rows they need a virtualiser inside the viewport, and our
  family must not get in its way — which is an argument for the viewport being a plain, real
  scroller with nothing intercepting its scroll events (§7).
- **Alternative-named implementations worth crediting:**
  - **CSS scroll-driven animations** (`animation-timeline: scroll()`). Not a library — the platform.
    §5 shows shadcn/ui shipping scroll-aware edge fades with it and a comment in the shadcn-vue port
    reading "no JavaScript required". If a scroll *position* can drive a mask, it can drive a thumb.
  - **`::scroll-marker-group` / `::scroll-button()`** (CSS Overflow 5). The platform generating
    navigation controls for a scroller with no JavaScript. Adjacent to pagination rather than to us
    (`research-pagination.md` §4), but the same message.

**Recommendation: keep the QDS name `scroll-area`.**

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
scroll-area-root.tsx   scroll-area-view-port.tsx   scroll-area-scrollbar.tsx   scroll-area-thumb.tsx
scroll-area-context.ts   index.ts   metadata.json   research.mdx   scroll-area.css
scroll-area.old-tests.tsx
```

`index.ts`:

```ts
export { ScrollAreaRoot as root }         from "./scroll-area-root";
export { ScrollAreaViewport as viewport } from "./scroll-area-view-port";
export { ScrollAreaScrollbar as scrollbar } from "./scroll-area-scrollbar";
export { ScrollAreaThumb as thumb }       from "./scroll-area-thumb";
```

**Four parts: root, viewport, scrollbar, thumb.** No content part (Radix, Base UI and Ark UI all
have one), no corner part (Radix, Base UI and Ark UI all have one).

**The test file is named `scroll-area.old-tests.tsx`.** There is no `scroll-area.browser.tsx`. Read
that plainly: **this family is the least-tested one in the QDS reference**, and the defects in §2's
list below are exactly what an untested family accumulates. Our parity table should say so rather
than implying we are porting proven behaviour.

### What QDS actually implements

| Concern | QDS behaviour |
| --- | --- |
| Root props | `type?: 'hover' \| 'scroll' \| 'auto' \| 'always'` (default `'hover'`), `hideDelay?: number` (default 600) |
| Root element | `<div>` with `ui-type={type}`, `ui-has-overflow`, and `onMouseEnter$`/`onMouseLeave$` that set `isHovering` **only when `type === 'hover'`** |
| Viewport | `<div>` with `tabIndex={0}`, `role="region"`, `aria-label="Scrollable content"` — hard-coded |
| Overflow detection | `scrollHeight > clientHeight \|\| scrollWidth > clientWidth`, recomputed on scroll, on `document` `resize`, on `document` `wheel` with ctrl/meta held, on ctrl/meta `+`/`-`/`0` keydown (via a synthetic `qdsoverflowcheck` event on a 50 ms timer), on the `ref` callback, and on `window:onLoad$` |
| Thumb position | on every scroll, `verticalScrollbar.querySelector("[ui-qds-scroll-area-thumb]")` then `thumb.style.transform = translateY(ratio * maxTop)` |
| Track click | ratio of click position to track length → `viewport.scrollTop = ratio * maxScroll` (jump-to, not page-up/page-down) |
| Thumb drag | `onMouseDown$` on the thumb captures start position, plus `useOnDocument("mousemove")` and `useOnDocument("mouseup")` registered **unconditionally** |
| Scrollbar visibility | a `shouldShow()` function switching on `type`, writing `ui-state="visible" \| "hidden"` |

### Seven things in QDS worth not copying — six of them are defects

1. **`document.querySelector("[ui-qds-scroll-area-viewport]")` in the window-load handler**
   (`scroll-area-view-port.tsx:114`) takes the **first scroll area on the page** and dispatches the
   overflow check at it, regardless of which instance the handler belongs to. With two scroll areas,
   one of them never gets its load-time overflow check. This is the multi-instance bug that DOM
   sensing always produces, and it is exactly why our conventions forbid it.
2. **`context.thumbRef` is a single signal shared by both orientations.** `scroll-area-thumb.tsx:86`
   assigns `ref={context.thumbRef}` unconditionally, so in a root with both a vertical and a
   horizontal scrollbar the second thumb to render overwrites the first. The track-click handler then
   compares `e.target === thumb` against the wrong element, so clicking the vertical thumb is treated
   as a track click and jumps the scroll position. A vertical-and-horizontal scroll area is broken.
3. **The thumb is found by `querySelector` on every scroll event** rather than by a handle. Same
   sensing problem, plus a DOM query per scroll frame.
4. **`mousedown`/`mousemove`/`mouseup` — not Pointer Events.** Touch and pen drags on the thumb do
   not work at all. Every current library uses Pointer Events. This is the single largest functional
   gap in the family.
5. **The document `mousemove` and `mouseup` listeners are registered unconditionally**, for every
   thumb on the page, whether or not anything is being dragged. On a page with six scroll areas that
   is twelve always-live document listeners, each of which runs a guard and returns. This is the
   precise opposite of "no JS until interaction", and §7 shows it is unnecessary — `setPointerCapture`
   removes both.
6. **`role="region"` + a hard-coded English `aria-label="Scrollable content"`.** The role and the
   `tabindex` are *right* (§4). The label is wrong twice: it is not translatable, and it is not
   overridable, so a page with three scroll areas announces three identical landmarks named
   "Scrollable content" — which is the exact failure mode a name is supposed to prevent.
7. **`ui-state="visible" | "hidden"` is a key-value state string** where our convention is presence
   attributes. It is genuinely two-valued and derived, so `ui-visible` presence is the direct
   translation.

One thing QDS gets right and is worth keeping explicitly: **the viewport is a real scroller.** QDS
never intercepts the wheel, never `preventDefault`s a scroll, and never re-implements momentum.
Everything native stays native: keyboard scrolling, `scroll-behavior`, `scroll-snap`,
`overscroll-behavior`, trackpad inertia, `scrollIntoView`, find-in-page scrolling, and a virtualiser
placed inside it. That is the correct core and every library surveyed agrees.

---

## 3. Headless library survey

| Library | Has it? | Parts | Notes | Verified |
| --- | --- | --- | --- | --- |
| **Base UI** | yes | `Root`, `Viewport`, `Content`, `Scrollbar`, `Thumb`, `Corner` | `Root` has `overflowEdgeThreshold`; exposes CSS variables `--scroll-area-thumb-height/width` and `--scroll-area-overflow-x/y-start/end` (distance from each edge, in px); `Scrollbar` has `orientation` and `keepMounted` | fetched `base-ui.com/react/components/scroll-area`, 2026-08-22 |
| **Ark UI** (zag) | yes | `Root`, `Viewport`, `Content`, `Scrollbar`, `Thumb`, `Corner` | native scrollbar hidden by **required CSS** on the viewport (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`); state exposed as `data-overflow-x/y`, `data-at-top/bottom/left/right`, `data-dragging`, `data-hover`, `data-scrolling` | fetched `ark-ui.com/react/docs/components/scroll-area`, 2026-08-22 |
| **Radix UI** | yes | `Root`, `Viewport`, `Scrollbar`, `Thumb`, `Corner` | the original of this anatomy; `type: 'auto' \| 'always' \| 'scroll' \| 'hover'` and `scrollHideDelay` are Radix's props, which is where QDS's `type`/`hideDelay` come from | not re-fetched this session; the prop names in QDS's root are the receipt |
| **QDS** | yes | `root`, `viewport`, `scrollbar`, `thumb` | no content part, no corner part | source read 2026-08-22 |
| **Kobalte / Bits UI / Melt UI / Ariakit / Corvu / Headless UI / React Aria / Dice UI** | **not verified** | — | not fetched this session | — |

Consensus, and where QDS sits:

- **The anatomy is settled and QDS is missing two parts of it.** `Content` (an inner wrapper that
  makes the intrinsic size measurable and lets the viewport be `display: block` while content is
  `min-width: max-content`) and `Corner` (the square where two scrollbars meet) are in Radix, Base UI
  and Ark UI. Whether we need them is §7's question, not a defect.
- **Everybody hides the native scrollbar with CSS and paints their own.** Ark UI states it as a
  *required* stylesheet; Base UI does the same. Nobody re-implements scrolling itself.
- **Everybody publishes the thumb's geometry as CSS custom properties** rather than as inline
  styles. Base UI's `--scroll-area-thumb-height` is the model, and it is a strictly better seam than
  QDS's `thumb.style.transform =` — the author decides whether that number becomes a `height`, a
  `translate`, or nothing.
- **Nobody documents ARIA for the scrollbar parts.** Ark UI's API reference lists no ARIA at all;
  Base UI's lists none. §4 explains why that is correct: a painted scrollbar is decoration, and
  `role="scrollbar"` on it would be a lie.
- **Base UI exposes the distance from each edge in pixels as a CSS variable**
  (`--scroll-area-overflow-y-start`), which is what its shadow/fade affordances key off. Since the
  same effect is available from CSS alone via scroll-driven animations (§5), that variable is a
  fallback for browsers without scroll timelines rather than the primary mechanism.

---

## 4. Specifications and expert commentary

### There is no APG pattern, and `role="scrollbar"` is a trap

`w3.org/WAI/ARIA/apg/patterns/` has no scroll-area pattern. WAI-ARIA *does* define
`role="scrollbar"` (with `aria-controls`, `aria-orientation`, `aria-valuenow`), and it is the wrong
thing to reach for here: it describes a widget that is the *only* way to scroll something, operable
by keyboard, with a value. Our painted thumb sits on top of a viewport that is already scrollable by
keyboard, wheel, trackpad, touch and find-in-page. Marking the decoration as a scrollbar adds a
second, redundant control to the accessibility tree and a set of keyboard obligations
(`Home`/`End`/arrows on the scrollbar itself) that nothing in the surveyed field implements. **The
painted scrollbar and thumb should be `aria-hidden`**, exactly as the OTP items should be
(`research-otp.md` §7): they are paint over a real control.

### aria-at coverage: none

No plan for scroll area, scrollbar, or region among the 40 folders under `w3c/aria-at/tests/apg`
(full list in `research-otp.md` §4, read 2026-08-22). No community-vetted assertions exist for this
family.

### The one real accessibility requirement: a scroll container must be reachable by keyboard

This is the family's whole accessibility story, and it is well established:

- **axe rule `scrollable-region-focusable`** ("Ensure that scrollable region has keyboard access") —
  `dequeuniversity.com/rules/axe/4.8/scrollable-region-focusable`. A scrollable region with no
  focusable children fails it.
- **Adrian Roselli, *Keyboard-Only Scrolling Areas* (2022-06)** — located this session by search;
  the summary retrieved states his position directly: give the scrolling area a `tabindex` so arrow
  keys can scroll it once focused; this covers areas with no interactive children, and areas whose
  interactive children (radios, selects) change value when arrowed through. Then, because it is now
  focusable, **it must have an accessible name, which means it must have a role**, and he uses
  `region` "since it is a generic landmark". The same summary records Chrome shipping
  keyboard-focusable scrollers to all users around Chrome 125–127, i.e. the browser is converging on
  doing this automatically. *The article itself was not fetched in full; this is the search summary,
  and it is consistent with the axe rule.*

Two consequences for our API:

1. **`tabindex="0"` on the viewport is not optional.** QDS is right to hard-code it.
2. **The name is the consumer's, not ours.** QDS hard-codes `"Scrollable content"`. That is worse
   than nothing on a page with several scroll areas: identical names are indistinguishable, and it
   ships English into every locale. Our viewport should require a name and refuse to invent one.

The open sub-question, which §10 puts to the owner, is **`role="region"` vs `role="group"`**.
`region` is a landmark: a reader's landmark list gets an entry per scroll area, which is the point
when there is one significant scroll region on the page and noise when there are six (a chat
sidebar, a code block, a table, a menu). `group` also supports naming and is not a landmark. Roselli
chose `region`; Radix, Base UI, Ark UI and shadcn set **no role at all** on the viewport, which fails
the naming half of the requirement. This is the one place the field and the expert disagree.

### The platform has taken most of this family back

Four things that used to require a library and now do not:

- **`scrollbar-width: thin | none | auto`** and **`scrollbar-color: <thumb> <track>`** — standard
  CSS, and the reason SimpleBar and perfect-scrollbar existed. Firefox has had them longest;
  Chromium adopted them.
- **`scrollbar-gutter: stable | stable both-edges`** — reserves the scrollbar's space so content
  does not reflow when a scrollbar appears. §5 shows it in wide production use, always behind
  `@supports`.
- **`::-webkit-scrollbar` and friends** — the legacy Chromium-only route, still what every "custom
  scrollbar" snippet reaches for, and now the fallback rather than the primary.
- **`animation-timeline: scroll()`** — scroll-driven animations, which make a scroll *position* a CSS
  input. §5 shows shadcn using it in production. A thumb's `translate` is a scroll position; so is a
  fade at each edge; so is a progress bar.

The honest summary for our docs: **most consumers who ask for a "custom scrollbar" want
`scrollbar-width` and `scrollbar-color` and should be told so.** The family earns its keep for the
consumers who need a scrollbar that native styling cannot express — a thumb with a shape, a track
with an inset, a scrollbar that overlays rather than reserves — and for the keyboard/naming half,
which no amount of CSS provides.

---

## 5. GitHub patterns (grep MCP)

Searches run: `scrollbar-gutter: stable` (CSS), `animation-timeline: scroll(` (CSS),
`::scroll-marker-group` (CSS, reported in `research-pagination.md` §4). Findings:

- **`scrollbar-gutter: stable` is in mainstream production use and is always guarded.** Docusaurus
  and MystenLabs' Sui docs (`@supports (scrollbar-gutter: stable)` around the sidebar padding),
  Shopify Polaris (`scrollbar-width: thin` + `scrollbar-gutter: stable` +
  `scrollbar-color` together), OpenHands (with an `@supports not` fallback to padding), coder/coder,
  HKUDS, rsschool-app, docusaurus-theme-classic. The `@supports`-guarded shape is the ecosystem's
  convention and should be ours in docs.
- **The single most useful finding in this document:** coder/coder's `index.css` carries a comment
  explaining that they set `scrollbar-gutter: stable` on `html` **specifically to defeat a
  scroll-lock library's JavaScript scrollbar-width compensation**, which was double-spacing:
  > "Prevent layout shift when modals open by maintaining scrollbar width. `scrollbar-gutter: stable`
  > reserves space for the scrollbar so Radix's scroll-bar compensation (margin-right/padding-right)
  > is unnecessary and causes double spacing. We zero it out with `!important` to win over Radix's
  > injected `!important` styles."
  A CSS property replacing a library's JavaScript measurement — and the library's JavaScript
  actively fighting it. That is the frame of this family in one production comment.
- **Scroll-driven animations are shipping in the most-copied stylesheet in the ecosystem.**
  shadcn/ui's own `packages/shadcn/src/tailwind.css` implements scroll-aware edge fades with
  `@supports (animation-timeline: scroll())` / `animation-timeline: scroll(self y)` and an
  `@supports not` static fallback. The identical block appears in shadcn-vue's CLI stylesheet,
  spartan-ng, stagewise's `scroll-fade.css`, elizaOS, bitfocus/companion, withastro/flue, and
  `next-shadcn-dashboard-starter`. unovue's copy carries the comment that says it outright:
  > "Driven by CSS scroll-driven animations (`animation-timeline: scroll(self)`) so an edge only
  > fades while there is content to reveal in that direction — **no JavaScript required.** Falls back
  > to a static fade where scroll timelines are unsupported."
  lmnr-ai uses `@supports (animation-timeline: scroll(self y))` with the more precise axis query.
  **If an edge fade can be driven by scroll position with no JavaScript, so can a thumb's
  translate** (§7).
- **Nobody in this sample used `role="scrollbar"`**, which corroborates §4.

---

## 6. Expected screen-reader behaviour

No aria-at plan exists (§4); derived from semantics, and testable as accessibility-tree assertions.

**Sequence A — Tab to the viewport**
1. keypress `Tab`
2. → the viewport's accessible name (the consumer's, e.g. "Release notes")
3. → "region" (or "group", per §10's ruling)

Then arrow keys scroll it. This is the sequence the axe rule and Roselli's post exist for, and it is
the family's reason to be a family at all.

**Sequence B — Arrow keys with the viewport focused**
1. `ArrowDown` / `PageDown` / `Home` / `End`
2. → the content scrolls; nothing is announced by us

All native. We add no key handling and must add none — intercepting `PageDown` here would break
`scroll-snap` and any virtualiser inside.

**Sequence C — Browse-mode traversal past the painted scrollbar**
1. reader's next-item command, with focus just before the scrollbar in DOM order
2. → **nothing**, then the next real content

This is the row that pins `aria-hidden` on the scrollbar and thumb. Exposed, they are two empty
generic elements in the middle of the reading order, and a reader that announces "group" twice for
decoration is a defect.

**Sequence D — Two scroll areas on one page**
1. reader's landmark list (if the role is `region`)
2. → two entries with **different** names

The row QDS fails today by hard-coding one name (§2, defect 6).

**Where readers differ.** Whether a focusable non-interactive container is announced with usage
hints varies (JAWS and NVDA give more guidance in browse mode than VoiceOver does). None of that is
ours to control and none of it should be asserted as a string. Assert the tree: focusable, named,
with a role, and no exposed decoration.

---

## 7. Markless API design

### Parts

`scroll-area.root`, `scroll-area.viewport`, `scroll-area.scrollbar`, `scroll-area.thumb` — the QDS
folder listing exactly.

Not added: `content` and `corner`, which Radix, Base UI and Ark UI all have and QDS does not. Both
are pure layout wrappers with no state, and a consumer can write a `<div>`. Recorded as a question
(§10) because `content` has one real job in the other libraries — making the intrinsic width
measurable for horizontal scrolling — and a consumer who does not know that will write a viewport
whose content never overflows horizontally. If we drop it, the docs must explain the
`min-width: max-content` trick that `content` was standing in for.

### The three tiers, and which one v1 ships

This family has a natural staircase, and naming it is more useful than a flat API:

**Tier 1 — root + viewport. Zero JavaScript, and it is most consumers' answer.**
A named, keyboard-reachable scroll container. Style the native scrollbar with `scrollbar-width`,
`scrollbar-color` and `scrollbar-gutter` (§4). No listeners, no measurement, nothing to resume.
This tier is *complete on the server*: the served HTML is already correct and interactive with the
JavaScript bundle never loading.

**Tier 2 — add scrollbar + thumb, positioned by CSS.**
The native scrollbar is hidden (`scrollbar-width: none`), a painted one is drawn, and the thumb's
position comes from `animation-timeline: scroll(nearest block)` — the mechanism shadcn ships in
production (§5). Still **zero JavaScript**, still nothing to resume. What CSS cannot give is the
thumb's *size*, because no CSS property exposes `scrollHeight / clientHeight`; a fixed-size thumb (a
common design) needs nothing, a proportional one needs measurement.

**Tier 3 — thumb dragging.**
The only genuinely interactive part of the family, and the answer to the packet's question:

> **What needs pointer listeners at interaction time?** Exactly one element — the thumb — and
> exactly three handlers on it: `onPointerDown`, `onPointerMove`, `onPointerUp`. **No document-level
> listeners at all**, because `setPointerCapture` redirects subsequent pointer events for that
> pointer to the capturing element. QDS's two always-registered `document` listeners per thumb (§2,
> defect 5) exist only because it uses mouse events, which have no capture.

```tsx
export function ScrollAreaThumb({ onPointerDown, onPointerMove, onPointerUp, ...rest }: ScrollAreaThumbProps) @{
	const area = scrollAreaState();

	<div
		{...rest}
		aria-hidden="true"
		ui-dragging={area.dragging}
		onPointerDown={(event) => {
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			area.startDrag(event.clientY, event.clientX);
			onPointerDown?.(event);
		}}
		onPointerMove={(event) => {
			area.dragTo(event.clientY, event.clientX);
			onPointerMove?.(event);
		}}
		onPointerUp={(event) => {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
			area.endDrag();
			onPointerUp?.(event);
		}}
	/>
}
```

Touch and pen work for free, because Pointer Events are input-agnostic. That is defect 4 fixed by
choosing the right event family rather than by adding code.

**Recommendation: ship tier 1 and tier 2 in v1, and treat tier 3 as a second unit** with its own
verdict on the unproven piece below. A scroll area that cannot be dragged by its painted thumb is
still fully usable by every input method the browser supports; a scroll area with no name and no
tabindex is broken for keyboard users. The tiers are in the right order.

### Types (`scroll-area-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type ScrollAreaRootProps = PropsOf<'div'> & {
	/** When the painted scrollbars show: while pointing at the area, while scrolling, or always. */
	readonly show?: 'hover' | 'scroll' | 'always';
	/** How long the scrollbars stay after scrolling stops, in milliseconds. Only used when `show` is "scroll". */
	readonly hideDelay?: number;
};

/** The element that actually scrolls. It needs a name: give it `aria-label`, or point `aria-labelledby` at a heading. */
export type ScrollAreaViewportProps = PropsOf<'div'>;

export type ScrollAreaScrollbarProps = PropsOf<'div'> & {
	readonly orientation?: 'vertical' | 'horizontal';
};

export type ScrollAreaThumbProps = PropsOf<'div'>;

export type ScrollAreaInstanceState = Seeded<ScrollAreaRootProps, 'show' | 'hideDelay'> & {
	scrolling: boolean;
	dragging: boolean;
};
```

Notes on the shape:

- **`show` replaces QDS's `type`.** `type` is a meaningless name on a scroll area (Radix's, which
  QDS inherited) and it collides with the HTML `type` attribute in every consumer's head.
  QDS's four values collapse to three: `'auto'` and `'always'` are the *same branch* in QDS's own
  `shouldShow()` — both return `hasOverflow` — so `'auto'` is a synonym that does nothing.
- **No `onChange`.** Scroll position is not this widget's state; the viewport owns it and a consumer
  who needs it writes `onScroll` on the viewport through `{...rest}`.
- **No `overflowEdgeThreshold`** (Base UI) and no exposed edge distances in v1: scroll-driven
  animations give a consumer the same affordances in CSS (§5).
- **The viewport takes no `label` prop.** It is `PropsOf<'div'>`, so `aria-label` and
  `aria-labelledby` arrive through `{...rest}` like any other attribute. Requiring a *prop* would be
  inventing an API for something HTML already spells.

### Instance and parts

```tsx
export const scrollAreaState = shared(
	() => {
		const area: ScrollAreaInstanceState = state({
			show: 'hover',
			hideDelay: 600,
			scrolling: false,
			dragging: false,
		});
		const viewportEl = element<HTMLDivElement>();

		return { ...area, viewportEl /* … drag methods for tier 3 … */ };
	},
	{ scope: 'widget' },
);

export function ScrollAreaRoot({ show = 'hover', hideDelay = 600, children, ...rest }: ScrollAreaRootProps) @{
	const area = scrollAreaState();
	area.show = show;
	area.hideDelay = hideDelay;

	<div {...rest} ui-show={area.show} ui-scrolling={area.scrolling}>{children}</div>
}

export function ScrollAreaViewport({ children, ...rest }: ScrollAreaViewportProps) @{
	const area = scrollAreaState();

	<div {...rest} el={area.viewportEl} tabindex="0" role="region">{children}</div>
}

export function ScrollAreaScrollbar({ orientation = 'vertical', children, ...rest }: ScrollAreaScrollbarProps) @{
	<div {...rest} aria-hidden="true" ui-vertical={orientation === 'vertical'} ui-horizontal={orientation === 'horizontal'}>{children}</div>
}
```

Deliberate differences from QDS, each with its reason:

- **No overflow detection at all in tier 1/2.** QDS spends six separate mechanisms on
  `hasOverflow` (scroll, document resize, ctrl-wheel, zoom keys, a synthetic event, window load) to
  decide whether to show a scrollbar. CSS already answers it: a scrollbar that is `height: 100%` of a
  track inside a container only *has* a thumb worth showing when there is overflow, and the
  scroll-driven animation is inert when the scroll range is zero. Dropping it deletes the
  multi-instance `querySelector` bug (defect 1), the 50 ms timer, the synthetic `qdsoverflowcheck`
  event, and every document listener except the drag's — which `setPointerCapture` also removes.
- **`ui-scrolling` on the root, not `ui-state="visible"`** — presence, per convention (defect 7).
  For `show: 'scroll'` the fade-out is `transition-delay: var(--hide-delay)` in CSS, not a
  `setTimeout` we own.
- **`aria-hidden="true"` on scrollbar and thumb** (§4).
- **`role="region"` and `tabindex="0"` on the viewport, no default label** (§4, and §10 question 1).

### What is not expressible today, and the one unproven thing tier 3 depends on

| Wanted | Status |
| --- | --- |
| Reading the viewport's `scrollTop`/`scrollHeight` from inside a pointer handler, through the `el` handle | **unproven on this branch.** `element()` handles are used for IDREF wiring in every shipped family; no family reads a live DOM property off one inside a handler. Tier 3 cannot be written without it. This is the red-first spike that gates tier 3, and it is a *question about a landed capability*, not a request for a new one |
| A proportional thumb size (`thumbHeight = clientHeight / scrollHeight × trackHeight`) | needs the same measurement, plus re-measurement when content or size changes — i.e. a `ResizeObserver`. **No authoring surface for element observers exists on this branch**, and this document does not propose one (§8) |
| `hideDelay` as a real timer | not needed: `transition-delay` in CSS |
| A consumer `onScroll` spread onto `scroll-area.viewport` reaching the graph | `checklist/note.md` limit 1 — the spread reaches the element but records no graph binding |

### Flippable arms and SSR

This family is the **cheapest possible SSR case in the package**, and that is worth saying: tiers 1
and 2 have no client state at all. The served HTML scrolls, is keyboard-reachable, is named, and
paints its scrollbar — with the bundle never loading. Nothing to seed, nothing to resume, no
gesture to replay. Tier 3 adds exactly one boolean (`dragging`) that is always `false` on the server.

---

## 8. What this family needs from the framework

**Tiers 1 and 2: nothing.** No new capability, no new diagnostic, no new authoring surface. That is
the whole point of the tier split, and it is why scroll-area is the right family to land **first** in
tranche 5 if the goal is a quick green — though `research-pagination.md` §10 recommends qr-code
first on the same reasoning.

**Tier 3 needs one existing capability proven, and may need one that does not exist:**

1. **Reading a live DOM property through an `element()` handle inside an event handler.** Not new —
   the handles exist and are used for IDREF wiring — but *unproven in this direction* on this branch.
   A red-first witness before the tier-3 unit is cut, not a discovery during implementation. If it
   refuses, tier 3 is deferred and tiers 1–2 still ship a complete family.
2. **Element observation (`ResizeObserver`) for a proportional thumb.** No authoring surface exists,
   and **this document does not propose one.** The v1 answer is a fixed-size thumb, which is a common
   design and needs nothing. Recorded as owner question §10.4 so the gap is visible rather than
   quietly designed around.

**What this family contributes to the cluster memo** (`research-pagination.md` §8): it is the
negative case, the way collapsible was for tranche 4. No index, no ordering, no IDREF set, no
callback slot, no repeat. If a scroll-area row is red, the defect is in plain element rendering, not
in anything this package invented. It also settles one thing for the package generally: **"the
platform already does this" is a legitimate design answer, and the family's job is then the part the
platform does not do** — here, the accessible name and the keyboard reachability, which no CSS
property provides.

---

## 9. Test plan

`packages/headless/components/src/scroll-area/scroll-area.browser.ts`, scenarios under
`src/scroll-area/scenarios/`. Part-role testids: `root`, `viewport`, `scrollbar`, `thumb`.

Scenarios, starter first:

1. `basic.tsrx` — root, viewport with a fixed height and overflowing prose, an `aria-label`.
2. `release-notes.tsrx` — the realistic one: a heading, a viewport labelled by that heading through
   an `element()` handle in `aria-labelledby`, long content, a painted vertical scrollbar and thumb.
3. `both-axes.tsrx` — vertical **and** horizontal scrollbars in one root. This is the scenario QDS
   is broken on (§2, defect 2), so it is the one that proves we are not.
4. `named-by-heading.tsrx` — `aria-labelledby` pointing at an `element()` handle, the cross-part
   IDREF shape collapsible proved.
5. `two-areas.tsrx` — two scroll areas on one page with different names; the instance-isolation row
   and the QDS defect-1 and defect-6 row in one scenario.
6. `no-overflow.tsrx` — content shorter than the viewport: still focusable, still named, thumb
   inert.
7. `tier-3-drag.tsrx` — *deferred with tier 3*; listed so the file exists in the plan.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| the viewport carries `tabindex="0"` | the axe rule and Roselli's post (§4); the family's one hard accessibility obligation |
| the viewport carries `role="region"` and **no** default `aria-label` | the deliberate deviation from QDS (§2, defect 6): assert that we did *not* invent a name |
| a consumer `aria-label` on the viewport survives to the element | the naming path, through `{...rest}` |
| `aria-labelledby` on the viewport equals the heading's minted `id`, both non-empty | the cross-part IDREF shape |
| the scrollbar and the thumb both carry `aria-hidden="true"` | §4; assert it so nobody adds `role="scrollbar"` later |
| the accessibility tree under the root contains **one** named container, not three | the same point as a property rather than an attribute |
| pressing `ArrowDown` with the viewport focused increases its `scrollTop` | proves we did not break native scrolling — the single most important behavioural row in the family |
| `{...rest}` cannot overwrite `tabindex` or `role` | spread-first convention |
| in `both-axes.tsrx`, the two thumbs are **distinct elements** and neither handler touches the other | QDS defect 2; the row that justifies the scenario |
| two co-rendered areas keep independent state (`ui-scrolling` on one only) | QDS defect 1; widget-instance isolation |
| **no `document`-level listener is registered by the family** | the frame of this document; assert by counting listeners on `document` before and after render, in a scenario with several areas |
| SSR: the served HTML already has `tabindex`, `role`, the label, and scrollable content — with no resume | tiers 1–2 are complete on the server; this is the row that proves it |
| SSR + resume: after resume, nothing changed | the negative resume row; a family with no client state should be byte-identical after resume |

Unit-adjacent rows worth having even though they are CSS, run as browser assertions:
`scrollbar-width: none` on the viewport actually hides the native scrollbar in Chromium (the Ark UI
required-CSS fact), and a thumb with `animation-timeline` set has a non-identity transform after
scrolling — **conditioned on `CSS.supports('animation-timeline', 'scroll()')`**, skipped otherwise,
so the suite does not go red on a runner without scroll timelines.

**Not tested, and why:** real trackpad momentum, real touch drag, OS scrollbar appearance settings,
and browser zoom (QDS's ctrl-`+` overflow re-check) cannot be driven from vitest browser mode. Say so
in the parity table. Tier 3's drag can be driven with synthetic pointer events once tier 3 exists;
until then the parity table should say the thumb is decorative in our v1, because that is true.

---

## 10. Open questions

1. **`role="region"` vs `role="group"` vs no role on the viewport.** Recommended: `region`,
   following Roselli, and accept the landmark entry. This is the question the owner most needs to
   answer, because it is the one place the expert guidance (`region`, a landmark) and the entire
   shipped field (Radix, Base UI, Ark UI, shadcn: no role at all) disagree — and "no role" fails the
   naming requirement that follows from making the thing focusable. `group` is the compromise:
   nameable, not a landmark, no reader convention behind it.
2. **Shipping tiers 1–2 and deferring tier 3 (thumb dragging).** Recommended: yes. A thumb that
   cannot be dragged is a visual affordance on a container that scrolls by every other means, and
   the deferral removes the family's only dependency on an unproven capability (§8). The owner should
   know this is the most visible functional gap against QDS and Radix, and that it will read as
   "unfinished" to anyone who tries to drag it.
3. **Adding `content` and `corner` parts.** Recommended: no in v1, with a docs note about
   `min-width: max-content` for horizontal scrolling — the job `content` does in Radix/Base UI/Ark UI.
   Confirm, because dropping `content` is the kind of omission that produces "horizontal scrolling
   doesn't work" bug reports from consumers who never read that note.
4. **A fixed-size thumb in v1 (no proportional sizing).** Recommended: yes. Proportional sizing needs
   element observation, there is no authoring surface for it, and this document deliberately does not
   propose one. If the owner wants proportional thumbs, that is a framework charter with its own
   scope, not a line in this family.
5. **`show` replacing QDS's `type`, and collapsing `auto` into `always`.** Recommended: yes — `auto`
   and `always` are the same branch in QDS's own code. It is a public prop rename plus a value
   removal, so it wants one word.
6. **Whether this family should exist at all, given §4.** Recommended: yes, but the docs must open
   with "if you want a differently-coloured scrollbar, use `scrollbar-color` and stop reading". The
   family's real product is a *named, keyboard-reachable* scroll container plus an escape hatch for
   scrollbars CSS cannot express. Selling it as "custom scrollbars" would be selling the part the
   platform already ships.
