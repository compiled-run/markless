# Navbar — component research for `@markless/ui`

**Research date:** 2026-08-23
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**Branch read for Markless facts:** `feat/headless-ui-pilot` @ `fc66d3f9`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/navbar/` (READ-ONLY),
including its own `research.md`, `spec.md`, `hover-research.md` and `click-toggle-research.md`

---

## 0. Presence check — the packet's first instruction

The packet asked to verify navbar is in QDS's folder listing before writing anything, and to stop
with an honest-absence record if it is not.

**Navbar is present.** `ls ~/dev/open-source/qwik-design-system/libs/components/src/navbar/` returns
eleven entries, including four component files, a browser suite, and three research documents. The
family is real, implemented, and tested (19 browser tests). This note is therefore the full
research note, not an absence record.

**One honest absence inside it, and it is worth recording precisely.** `spec.md` specifies **five**
parts and names `navbar-item-link.tsx` / `navbar.itemlink` in its file-structure section and its
export shape. `index.ts` exports **four**, and there is no `navbar-item-link.tsx` on disk. So:

| Specified | On disk | Exported |
| --- | :-: | :-: |
| `navbar.root` | yes | yes |
| `navbar.item` | yes | yes |
| `navbar.itemtrigger` | yes | yes |
| `navbar.itemcontent` | yes | yes |
| `navbar.itemlink` | **no** | **no** |

`spec.md` also names `navbar-list.tsx` and `navbar.old-tests.tsx` under a "Removed" heading, so the
spec is describing a state ahead of the code in one direction and behind it in another. **The code
is the judge** (the SKILL says so explicitly: "QDS docs are stale; the code is the judge"), so our
part inventory is four. The consequence for `aria-current="page"` — which was `itemlink`'s whole
job — is §7's active-page section, and it is a real design gap, not a copying oversight.

---

## 1. Name and alternates

Searched under: navbar, navigation menu, nav menu, menubar, app bar, header nav, mega menu, site
navigation, primary navigation, disclosure navigation.

- **NavigationMenu** is the name in Radix, Base UI, Kobalte and Bits UI. **Navbar** is QDS's. Same
  family — this is the SKILL's own worked example ("Navigation Menu → Navbar/AppBar").
- **Menubar** is a *different* family, and the difference is the single most important
  accessibility fact about this one. QDS's `spec.md` decision #2 states it: *"Menubar forces screen
  readers into application/forms mode. WAI-ARIA APG, Adrian Roselli, and all surveyed libraries
  agree: site navigation uses disclosure, not menubar."* The APG's own disclosure-navigation
  example says the same: *"This implementation of site navigation does not use the menu role because
  it does not provide the complex functionality that assistive technologies expect."* QDS even
  ships a browser test named `"no menubar or menu roles present"`. **Navbar is a disclosure
  pattern.**
- **Mega menu** is a styling variant of the same thing — a wide `itemcontent` with a grid inside.
  Not a separate family; it is a scenario.
- **App bar** (Material) mixes navigation with actions and branding. Layout, not a headless family.
- **Alternative-named implementations:** nothing found under an alternate name with a pattern the
  tier-1 set lacks. The interesting variation is entirely in *hover timing*, which QDS researched
  separately in `hover-research.md` (§3).

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
navbar-root.tsx          navbar-item.tsx        navbar-item-trigger.tsx
navbar-item-content.tsx  index.ts               navbar.browser.tsx
research.md              spec.md                hover-research.md
click-toggle-research.md
```

`index.ts`:

```ts
export { NavbarRoot        as root }        from "./navbar-root";
export { NavbarItem        as item }        from "./navbar-item";
export { NavbarItemTrigger as itemtrigger } from "./navbar-item-trigger";
export { NavbarItemContent as itemcontent } from "./navbar-item-content";
export { navbarContextId   as contextId }   from "./navbar-root";
```

**Four parts** (plus a context id, which is not a part).

### Navbar composes popover — and that is the whole design

`navbar.item` **is** a `PopoverRoot`. `navbar.itemtrigger` **is** a `PopoverTrigger`.
`navbar.itemcontent` **is** a `PopoverContent`. The navbar family adds a `<nav>` wrapper, a hover
group, arrow-key navigation between the top-level triggers, arrow-key navigation inside the open
content, and a focus-out that closes everything. Everything else — open/closed state,
`aria-expanded`, `popovertarget`, light dismiss, Escape, focus return — **is popover's**.

The SKILL is explicit about what that means: *"Does it compose another family (the way navbar wraps
popover)? Composition inherits the composed family's API — do not re-invent it."* Navbar is the
named example in our own workflow doctrine.

**Consequence, and it is the gating fact for this family:** `packages/headless/components/src/`
currently holds `base, checkbox, checklist, collapsible, otp, pagination, progress, qr-code,
radio-group, scroll-area, tabs, textbox, toggle`. **There is no popover family.** Navbar cannot be
built before popover lands, and its API is not fully decidable until popover's is. This note
designs the navbar-specific surface and defers everything popover owns to
`research-popover.md`.

### What QDS actually implements

| Concern | QDS behaviour (from the code) |
| --- | --- |
| Root | `<nav>`, `ui-qds-navbar-root`; provides `NavbarContext` = `{ hover, hoverGroup, hoverClickGrace, localId, rootRef, closeAllCounter }` |
| Root props | `hover` (`true`), `delay` (`200`), `switchDelay`, `hoverClickGrace` (`300`) |
| Root keyboard | a `sync$` that `preventDefault`s `ArrowLeft`/`ArrowRight`, then a handler that walks **top-level focusables** and moves focus with wrap-around |
| The walk | a `TreeWalker` over `a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])` that **rejects any subtree under `[ui-qds-popover-content]`** — so links inside an open dropdown are not top-level |
| Root focus-out | if the new focus target is outside the root, bump `closeAllCounter`, which every item watches and closes on |
| Item | `PopoverRoot` with `hover={context.hover}`, the shared `hoverGroup`, `closeDelay={0}`, `bind:open`; provides `NavbarItemContext = { isOpen, focusOnOpen }` |
| Item trigger | `PopoverTrigger` plus: a `hoverClickGraceUntil` timestamp written into an attribute, a `sync$` that swallows a click inside the grace window, and `ArrowDown` → set `openReason = "keyboard"`, `focusOnOpen = true`, open |
| Item content | `PopoverContent` plus: on `toggle` to open, if `focusOnOpen`, focus the first focusable inside; a `sync$` that `preventDefault`s six keys; and its own `TreeWalker` arrow/Home/End navigation **within** the content |
| Hover timing | `useHoverGroup({ delay, switchDelay })`, shared by every item, so switching between items is instant while any is open |

Navigation keys, consolidated:

| Key | Where | Behaviour |
| --- | --- | --- |
| `ArrowRight` / `ArrowLeft` | root | next / previous top-level focusable, wrapping |
| `ArrowDown` | trigger | open this item's content and focus the first thing inside |
| `ArrowRight` / `ArrowDown` | inside content | next focusable, wrapping |
| `ArrowLeft` / `ArrowUp` | inside content | previous focusable, wrapping |
| `Home` / `End` | inside content | first / last focusable |
| `Escape` | anywhere | closes, focus returns to the trigger — **free from `popover="auto"`** |
| `Tab` | anywhere | ordinary page order |

`spec.md` decision #6 states the Escape and focus-return behaviour is inherited from the platform,
not implemented: *"`popover='auto'` with `popovertarget` provides Escape-to-close and focus return
to the invoker element natively. No custom implementation needed."*

### Things to fix rather than copy

1. **`aria-current="page"` is not shipped.** §0. `spec.md` designed an `active` prop on
   `navbar.item` that sets `ui-active` and provides `isActive` down to an `itemlink` that writes
   `aria-current="page"`. Neither the prop nor the part exists in the code. **The aria-at
   disclosure-navigation plan carries `stateCurrentPage` as a priority-1 assertion** (§4b), so this
   is not a nicety — it is a required conveyance the shipped family cannot make.
2. **No `<ul>`/`<li>`.** `spec.md` decision #1 removed the list deliberately: *"`<nav>` landmark is
   the primary accessibility mechanism. 'list, X items' announcement is supplemental."* The APG's
   own example **does** use `ul`/`li`, and aria-at carries a `listBoundary` assertion for it — at
   **priority 3**, which is the weakest tier. So QDS's call is defensible and the cost is measured:
   one priority-3 assertion. Recording it rather than silently inheriting it.
3. **No default `aria-label` on the `<nav>`.** `spec.md` says the root "sets `aria-label` default to
   'Navigation' (overridable)"; the code sets nothing. aria-at's `nameMythicalUniversity` is a
   **priority-1** assertion on `aria-label` of the navigation region. A page with two `<nav>`s and
   no names is two anonymous landmarks. This one should be fixed, though not by hard-coding
   "Navigation" — see §7.
4. **`hoverClickGraceUntil` is written into a DOM attribute so a `sync$` handler can read it.**
   `ui-hover-click-grace-until={timestamp}` exists purely because the synchronous
   `preventDefault` handler cannot reach a signal. That is a Qwik-shaped workaround. Our equivalent
   constraint is the same one the landed tabs family documents — a browser-critical policy must be
   readable before the handler symbol loads (`tabs.tsrx:113`) — so we may need the same trick, but
   we should know we are copying a workaround, not a design.
5. **`Home`/`End` work inside the content but not at the top level.** `spec.md`'s keyboard table
   promises them for top-level triggers ("Home / End — Move focus to first/last top-level trigger or
   link") and the root handler implements only `ArrowLeft`/`ArrowRight`. The APG lists Home/End as
   optional, so this is a spec-vs-code gap, not a defect.
6. **Vertical orientation is out of scope** (`spec.md`, "Deferred Features"). Fine, and worth
   inheriting: a vertical navbar needs `ArrowUp`/`ArrowDown` at the top level, which collides with
   `ArrowDown`-opens-the-dropdown.

---

## 3. Headless library survey

| Library | Parts | Pattern | Mechanism |
| --- | --- | --- | --- |
| **Base UI** (`NavigationMenu`) | `Root, List, Item, Trigger, Icon, Content, Link, Backdrop, Portal, Positioner, Popup, Viewport, Arrow` | disclosure | portal + positioner; `delay` 50 ms, `closeDelay`; `orientation` |
| **Radix** (`NavigationMenu`) | `Root, List, Item, Trigger, Content, Link, Indicator, Viewport, Sub` | disclosure | portal; `delayDuration` 200 ms, `skipDelayDuration` 300 ms |
| **Kobalte** | same shape as Radix | disclosure | portal; 200/300, "direct port of Radix defaults" (QDS's `hover-research.md`) |
| **Bits UI** | same shape as Radix | disclosure | portal; 200/300, "Svelte port; confirmed in source" |
| **Ark UI** | no dedicated navigation menu; `Menu` is the actions family | — | — |
| **React Aria** | no navigation-menu component; ships `useHover` with no delay | — | — |
| **Ariakit** | `Hovercard` (500 ms both ways), `Menu` | — | — |
| **QDS** | 4 parts (§2) | disclosure | **native `popover="auto"`** |

Universal decisions:

| Decision | Universal? | Detail |
| --- | --- | --- |
| Disclosure, not menubar | **yes, all of them** | the strongest agreement in this whole tranche |
| `Root > List > Item > Trigger + Content` | 4/4 of the menu-shipping libraries | QDS drops `List` (§2.2) |
| A `Link` part | Base UI, Radix, Kobalte, Bits | **QDS specced it and dropped it** (§0) |
| A `Viewport` (one shared animated panel) | Base UI, Radix, Kobalte, Bits | QDS calls it "unnecessary complexity" and out of scope; each item owns its content |
| Hover with an open delay | all | |
| Instant switching between items once one is open | all, by different mechanisms | |
| Portal for the dropdown | 4/4 | **only QDS uses the platform** — same finding as select and popover |

### Hover timing — QDS's own comparison table, verbatim in substance

From `hover-research.md` (dated 2026-03-11, sources Radix, Kobalte, Bits, Floating UI, Ariakit,
React Aria, WCAG 2.1 SC 1.4.13 and SC 2.5.2):

| Library | Open delay | Close delay | Skip delay |
| --- | --- | --- | --- |
| Radix NavigationMenu | 200 ms | 150 ms internal | 300 ms |
| Kobalte | 200 ms | — | 300 ms |
| Bits UI | 200 ms | — | 300 ms |
| Floating UI `useHover` | 0 | 0 | none |
| Ariakit `HovercardProvider` | 500 ms | 500 ms | none |
| React Aria `useHover` | 0 | 0 | none |
| **QDS `useHoverGroup`** | **200 ms** | **0** | **300 ms**, plus instant while any item is open |

QDS's model differs from Radix's in a way its own document argues for: Radix's skip window only
applies for 300 ms after a close, whereas QDS switches instantly for as long as *any* item is open
and applies the 300 ms window only to the cold-start case. Its stated reason: *"if you're actively
browsing the menu, you expect instant switching."* That is a better model and we should inherit it.

**WCAG SC 1.4.13 (Content on Hover or Focus)** is the reason a close delay exists at all: content
revealed on hover must be dismissable, hoverable, and persistent. A zero close delay makes the
content un-hoverable when there is any gap between trigger and panel — which is what the safe
polygon in `spec.md` exists to solve, and which is popover's problem, not navbar's.

---

## 4. WAI-ARIA, aria-at, and expected screen-reader behaviour

### 4a. The APG disclosure navigation pattern

Read `w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/`, 2026-08-23.

**Markup:** a `<nav>` landmark wrapping `<ul>`/`<li>`; top-level `<button>`s carrying
`aria-expanded` and `aria-controls` pointing at the container they show; `<a>` elements inside,
optionally with `aria-current="page"` on the link for the current page.

**Keyboard:**

| Key | Behaviour |
| --- | --- |
| `Tab` / `Shift+Tab` | move among the buttons and the dropdown links |
| `Space` / `Enter` | toggle the dropdown, or activate a link |
| `Escape` | close the open dropdown and return focus to its button |
| arrow keys | **optional** — move between buttons and links; `ArrowDown` expands a collapsed dropdown |
| `Home` / `End` | **optional** — first / last button or link |

The Escape rule is not cosmetic: the APG notes it is what satisfies **WCAG 2.1 SC 1.4.13's
dismissability requirement** when focus is inside the navigation region.

**Why disclosure and not menubar:** quoted in §1. This is the pattern's defining constraint.

### 4b. aria-at coverage — **present**, and it maps almost exactly

`w3c/aria-at`, `tests/apg/`: **`disclosure-navigation` is one of the 40 plans**, and it is one of
the newer-layout plans with a real `data/assertions.csv`. Read 2026-08-23. Seventeen assertions:

| Assertion id | Priority | Conveys | Ref |
| --- | :-: | --- | --- |
| `roleNavigationLandmark` | 1 | role "navigation landmark" | `nav` |
| `nameMythicalUniversity` | 1 | name of the navigation region | `aria-label` |
| `roleRegion` | 1 | role "Region" | `region` |
| `nameMythicalUniversitySamplePageContent` | 1 | name of the region | `aria-label` |
| `roleButton` | 1 | role "button" | `button` |
| `nameAbout` / `nameAcademics` / `nameAdmissions` | 1 | the three button names | `button` |
| `stateCollapsed` | 1 | state "collapsed" | `aria-expanded` |
| `stateExpanded` | 1 | state "expanded" | `aria-expanded` |
| `stateChangeToCollapsed` | 1 | **change** to collapsed | `aria-expanded` |
| `stateChangeToExpanded` | 1 | **change** to expanded | `aria-expanded` |
| `roleLink` | 1 | role "link" | `htmlLink` |
| `nameOverview` / `nameCampusTours` | 1 | two link names | `htmlLink` |
| `stateCurrentPage` | **1** | state "current page" | **`aria-current`** |
| `listBoundary` | **3** | list boundary | `ul` |

Two rows deserve calling out because they decide open questions in §7:

- **`stateCurrentPage` is priority 1.** `aria-current="page"` is a must-convey. The shipped QDS
  family cannot convey it (§0). This makes the missing `itemlink` a **required capability**, not a
  deferred nicety.
- **`listBoundary` is priority 3.** The `<ul>` QDS dropped costs exactly one weakest-tier
  assertion. That is the measured price of `spec.md` decision #1, and it is small.

`nameMythicalUniversity` being priority 1 is the receipt for §2.3: an unnamed `<nav>` fails a
must-convey assertion.

### 4c. Expected announcements, derived from those assertions

The aria-at reference is a "Mythical University" nav with three buttons — About, Academics,
Admissions — each opening a list of links.

**Sequence A — Tab into the navigation**

1. keypress `Tab`
2. → "Mythical University" (`nameMythicalUniversity`, p1)
3. → "navigation landmark" (`roleNavigationLandmark`, p1)
4. → list boundary — NVDA "list, 3 items" (`listBoundary`, **p3**; absent in a QDS-shaped navbar)
5. → "About"
6. → "button" (`roleButton`, p1)
7. → "collapsed" (`stateCollapsed`, p1)

**Sequence B — `Enter` or `Space` on a collapsed button**

1. → "expanded" (`stateChangeToExpanded`, p1). The **change** is its own assertion, separate from
   the state — a reader that only re-reads the button on next focus fails this row.

**Sequence C — Tab into the open dropdown**

1. → "Overview" (`nameOverview`, p1)
2. → "link" (`roleLink`, p1)

**Sequence D — landing on the current page's link**

1. → the link name → "link"
2. → "current page" (`stateCurrentPage`, **p1**). **The row the shipped QDS family fails.**

**Sequence E — `Escape` inside the dropdown**

1. → "collapsed" (`stateChangeToCollapsed`, p1)
2. → focus is back on the button, which is re-announced with its name and role

**Sequence F — the page content region**

1. → "Mythical University sample page content" → "Region". Two p1 assertions about the *page*, not
   the navbar; included because they are in the plan and a transcript test over the plan's fixture
   will hit them.

**Not covered by aria-at, so ours to specify and test without a reference:** hover-opened
dropdowns (aria-at drives keyboards only), the arrow-key navigation QDS adds on top of the APG's
optional rows, and instant switching between items.

---

## 5. GitHub patterns (grep MCP)

- `popover="auto"` (TSX) shows the platform route is in production nav use:
  **`remix-run/remix`'s `docs-header.tsx`** ships
  `<nav id="site-primary-navigation" aria-label="Primary" popover="auto">` — a `<nav>` that *is* the
  popover, named, with the platform doing dismissal. That is very close to our target shape.
  `refined-github` pairs `popover="auto"` with a custom `<anchored-position anchor="…">` element,
  which is the CSS-anchor-positioning idea before the CSS shipped.
- **`microsoft/fluentui`'s headless preview package** is the most useful witness in the sample
  because it is a serious portal-free implementation with its findings written down:
  - `Popover.tsx`: *"Renders the surface in the browser's top layer with `popover='auto'`, letting
    the platform handle light dismiss (Escape, click-outside, popover-stack peer dismissal). Open
    paths ... flow through React; close paths defer to the browser, with `toggle` events mirrored
    back into state."* That is exactly QDS's `onToggle$` idiom in `navbar-item-content.tsx`.
  - `Popover.cy.tsx` marks a **known gap**: *"programmatic close: when React state flips
    `open: true → false`, the surface unmounts before any close-side effect can call
    `hidePopover()`"*. This is requirement **R4** in `research-popover.md` §7.2, independently
    confirmed, and the reason our content must never unmount.
  - A regression test worth stealing verbatim: *"should stay open after right click (no immediate
    light-dismiss)"* — the trailing `pointerup`/`auxclick` from a right-click was read by the
    browser's light-dismiss algorithm as an outside click.
- **`facebook/astryx`'s `BaseTypeahead.tsx`** names the landmine that will bite a hover-opened
  navbar: *"With `popover='auto'`, showing the popover between pointerdown and pointerup/click
  causes the browser's light-dismiss to immediately close it (the click is seen as 'outside' the
  newly-opened popover)."* Its fix is deferring `showPopover()` past the active click. QDS's
  `hoverClickGrace` is solving an adjacent problem (a hover-opened panel being immediately toggled
  shut by the click that follows), which suggests both are facets of one interaction.
- `useLayer.tsx` in the same repo: *"Reconcile browser-initiated closes (light-dismiss,
  `popover='auto'` stack eviction). These are the only cases where the DOM mutates without going
  through our show/hide — we sync React state back to match."* Confirms the `toggle`-event-mirrors-
  into-state pattern is the correct and only shape.

---

## 6. What navbar needs from the framework

Almost everything navbar needs is popover's, and `research-popover.md` §7.1 already tabulated it.
The rows navbar adds on its own account:

| # | Requirement | Status on this tip |
| --- | --- | --- |
| N1 | **A `<nav>` landmark with a name** | met by ordinary rendering, **except** the name: `aria-labelledby={navbar.labelEl}` on a root is blocked by `MARKLESS_ELEMENT_HANDLE_IDREF_WIDGET_ROOT`. Navbar has no label part, so a plain `aria-label` string through `{...rest}` is the route, and it is adequate |
| N2 | **`aria-current="page"` reaching a link** | needs a boolean travelling from `navbar.item` to something inside it. That is a nested widget instance read, the shape tabs ships (`tabsPartState`, `tabs.tsrx:39`). **Expected to work** |
| N3 | **Arrow navigation across top-level triggers** | a DOM walk off `event.target`, the idiom the landed tabs handler uses (`tabs.tsrx:132`). The subtlety is the *exclusion*: skip anything inside an open dropdown. QDS uses a `TreeWalker` with `FILTER_REJECT`; a `querySelectorAll` plus a `.closest('[popover]')` filter does the same job |
| N4 | **Focus-out that closes everything** | one handler on the root reading `event.relatedTarget` and comparing with `contains`. Plain JS in a handler |
| N5 | **Hover with a 200 ms open delay** | **a timer.** `research-popover.md` §7.1 records R13 (timers and delays) as **Unproven** — "nothing proves a pending timer survives — or is correctly abandoned across — an SSR resume or an unmount". Navbar is the first family in the tranche that cannot avoid one: select and tree replace their typeahead timers with a `Date.now()` comparison, but a *delayed open* genuinely needs a scheduled callback. **This is navbar's one novel framework requirement** |
| N6 | **A click-grace window after a hover-open** | a timestamp comparison, not a timer. QDS writes it into a DOM attribute so a `sync$` can read it (§2.4); we would need the same if the swallow must happen before the handler symbol loads |
| N7 | **Instant switching while any item is open** | one shared cell on the navbar instance (`openCount` or `anyOpen`), read by each item's hover logic. Ordinary graph traffic |

N5 is the only genuinely new one, and it should be spiked before the family is scheduled.

**Composition, concretely.** `navbar.item` rooting a `popover` widget instance *and* a navbar-item
instance is the "component body resolves family A while rooting family B" shape radio group's
research flagged (`research-radio-group.md` §6c.1) and tabs shipped in the simpler direction. Here
it is one level harder: `navbar.item` must root a **popover** root (a different family it does not
own) and be seeded by the navbar root above it. `packages/vitest-browser/browser/widget-shared.test.ts`'s
row *"CSR: a widget projected into another widget content resolves its own instance"* is the
nearest evidence. It is evidence, not proof, for this exact shape.

---

## 7. Markless API design

### Parts

`navbar.root`, `.item`, `.itemtrigger`, `.itemcontent` — the QDS `index.ts` exactly — **plus
`navbar.itemlink`**, which QDS specced and did not ship.

Adding a part QDS does not export is a deviation from the folder listing and has to be argued, not
assumed. The argument: `aria-current="page"` is a **priority-1 aria-at assertion** (§4b
`stateCurrentPage`), the family cannot convey it without somewhere to put the attribute, and
`spec.md` had already designed the part and named it `itemlink`. We are shipping QDS's own design,
not inventing one. **Recorded as an argued deviation; §9 question 1 asks for the ruling.**

### Types (`navbar-types.ts`)

```ts
import type { Handler, PropsOf, Seeded } from '@markless/core';

type TriggerProps = PropsOf<'button'>;

export type NavbarRootProps = PropsOf<'nav'> & {
	/** Dropdowns open when the pointer rests on an item. Omit it and they do. */
	readonly hover?: boolean;
	/** How long the pointer must rest before a dropdown opens, in milliseconds. */
	readonly delay?: number;
	/** How long after a hover-open a click on the same trigger is ignored, in milliseconds. */
	readonly clickGrace?: number;
};

export type NavbarItemProps = Omit<PropsOf<'div'>, 'onChange'> & {
	/** This item's dropdown is showing. */
	readonly open?: boolean;
	/** This item leads to the page a person is on now. */
	readonly active?: boolean;
	/** Called with the new state when this item's dropdown opens or closes. */
	readonly onChange?: (open: boolean) => void;
};

export type NavbarItemTriggerProps = Omit<TriggerProps, 'onClick' | 'onKeydown'> & {
	readonly onClick?: Handler<TriggerProps['onClick']>;
	readonly onKeydown?: Handler<TriggerProps['onKeydown']>;
};

export type NavbarItemContentProps = PropsOf<'div'>;
export type NavbarItemLinkProps    = PropsOf<'a'>;

export type NavbarInstanceState = Seeded<NavbarRootProps, 'hover' | 'delay' | 'clickGrace'> & {
	/** Some item's dropdown is showing, so the next one opens with no delay. */
	anyOpen: boolean;
};

/** One per rendered `<navbar.item>`; `itemlink` reads `active` off this. */
export type NavbarItemState = { open: boolean; active: boolean };
```

`switchDelay` is folded into `anyOpen` (QDS's better model, §3): while `anyOpen` is true the delay
is zero. One fewer prop, same behaviour.

`orientation` is **absent**, matching QDS's deferral — a vertical navbar's `ArrowUp`/`ArrowDown` at
the top level collides with `ArrowDown`-opens-the-dropdown, and neither QDS nor this note has
designed that.

### Sketch

```tsx
export const navbarState = shared(() => {
	const navbar: NavbarInstanceState = state({
		hover: true, delay: 200, clickGrace: 300, anyOpen: false,
	});
	return { ...navbar,
		// Every item watches this; the root's focus-out flips it.
		closeAll() { navbar.anyOpen = false; },
	};
}, { scope: 'widget' });

export const navbarItemState = shared(
	() => ({ ...state({ open: false, active: false }) }),
	{ scope: 'widget' },
);

export function NavbarRoot({ hover = true, delay = 200, clickGrace = 300, children, ...rest }: NavbarRootProps) @{
	const navbar = navbarState();
	navbar.hover = hover; navbar.delay = delay; navbar.clickGrace = clickGrace;

	// No default aria-label: an invented name is worse than a missing one, and
	// `{...rest}` lets the consumer give a real one. A dev diagnostic is the
	// right nudge, not a hard-coded "Navigation".
	<nav
		{...rest}
		ui-hover={navbar.hover}
		onFocusout={(event) => {
			// `target`, not `currentTarget`: the handler symbol runs after dispatch.
			const root = (event.target as HTMLElement).closest('nav');
			const next = event.relatedTarget as Node | null;
			if (root && (!next || !root.contains(next))) navbar.closeAll();
		}}
		onKeydown={(event) => { /* ArrowLeft / ArrowRight across top-level focusables */ }}
	>{children}</nav>
}

export function NavbarItemLink({ children, ...rest }: NavbarItemLinkProps) @{
	const item = navbarItemState();

	// The priority-1 assertion the shipped QDS family cannot make.
	<a {...rest} aria-current={item.active ? 'page' : undefined} ui-active={item.active}>{children}</a>
}
```

### The top-level walk, precisely

`ArrowRight`/`ArrowLeft` must move among top-level triggers and links and **must not** enter an open
dropdown. Off `event.target`:

```
const nav = (event.target as HTMLElement).closest('nav');
const walk = [...nav.querySelectorAll('a[href], button:not([disabled])')]
	.filter((el) => !el.closest('[popover]'));
```

The `[popover]` filter is the exact equivalent of QDS's `FILTER_REJECT` on
`[ui-qds-popover-content]`, expressed against the platform attribute instead of a QDS identity
attribute — which is what our `ui-*` convention requires anyway (no `ui-qds-*` identity attributes).

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| a 200 ms hover-open delay that behaves across SSR resume | **N5** — timers are unproven (`research-popover.md` §7.1 R13). Not refused, just unwitnessed |
| a `sync$`-equivalent that reads instance state before the handler symbol loads | the click-grace swallow (N6) may need it. The landed tabs handler shows the workaround: guard on **event fields alone** (`tabs.tsrx:113`, *"a browser-critical policy has to be readable before the handler symbol loads"*). A timestamp is not an event field, so QDS's write-it-into-an-attribute trick may be the only route |
| `navbar.item` inside a **flipping** `@if` arm | `MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED`. A nav whose items depend on sign-in state is an everyday shape |
| the whole family | **popover is not landed.** This is the gate |

---

## 8. Test plan

`packages/headless/components/src/navbar/navbar.browser.ts`, scenarios under
`src/navbar/scenarios/`. Part-role testids: `root`, `item`, `itemtrigger`, `itemcontent`,
`itemlink`, prefixed per item (`products-itemtrigger`, `docs-itemlink`).

Scenarios, starter first, special cases last:

1. `basic.tsrx` — a named `<nav>`, three items: one plain link, two with dropdowns. Asserts the
   landmark, its name, `aria-expanded="false"` on both triggers, and **no `menu`/`menubar` role
   anywhere** (QDS ships that exact test and it is worth copying).
2. `current-page.tsrx` — one item marked `active`, its link carrying `aria-current="page"` and no
   other link carrying it. **The priority-1 row from §4b.**
3. `site-header.tsrx` — realistic: a mega-menu item with a grid of links, a plain link, and a
   sign-in button outside the nav, so the focus-out row has somewhere to go.
4. `click-only.tsrx` — `hover={false}`; asserts hovering does nothing and clicking toggles.
5. `hover-timing.tsrx` — asserts the open delay, and that switching to a second item while the
   first is open is **instant** (§3's better model).
6. `grace.tsrx` — a hover-opened item; a click within the grace window does not close it; a click
   after it does. Both of QDS's rows.
7. `two-navbars.tsrx` — a primary and a footer nav on one page; arrowing in one must not touch the
   other, and the focus-out of one must not close the other.
8. `items-from-data.tsrx` — items authored with a keyed `@for`. **Expected to fail first.**
9. `conditional-item.tsrx` — one item inside a flippable `@if` arm (a sign-in-only entry).

Mode loop CSR/SSR for the shared rows. Explicit SSR+resume rows for:

- the served HTML has every dropdown closed, `aria-expanded="false"`, and the content present but
  not showing (never-unmount, per `research-popover.md` §7.2);
- `aria-current="page"` is on the right link **in the served HTML**, before any JavaScript — this is
  the whole reason `active` is a prop and not detected from the URL at runtime;
- the first `ArrowRight` after resume moves focus, and the first `ArrowDown` on a trigger opens and
  focuses inside;
- **a hover started after resume opens after the delay** — the N5 row, and the one most likely to
  be pinned.

Keyboard rows must assert the two disclosure-specific rules:

- **`Escape` closes and returns focus to the trigger** — the WCAG SC 1.4.13 dismissability row,
  inherited from `popover="auto"` and therefore also a check that we have not broken the platform's
  behaviour by intervening.
- **arrow keys never enter an open dropdown from the top level** — the `[popover]` filter (§7).

Add the two regression rows the Fluent UI suite contributes (§5): a right-click on a trigger does
not immediately light-dismiss the panel it opens, and a programmatic close does not leave a
detached top-layer entry.

A screen-reader lane (`navbar.sr.ts`) should carry Sequences A–E from §4c. Unlike carousel and
tree, these are **backed by an aria-at plan**, so the transcripts diff against
`tests/apg/disclosure-navigation` directly.

---

## 9. Open questions

1. **Ship `navbar.itemlink`, which QDS specced and did not build?** **Recommended: yes.**
   `aria-current="page"` is a priority-1 aria-at assertion and there is nowhere else to put it. This
   is a deviation from the QDS export list, argued on the assertion, and it implements QDS's own
   spec rather than a new design. Wants a ruling because QDS-is-the-API is a standing order.
2. **Do we get the `<ul>`/`<li>` back?** QDS dropped the list deliberately. The measured cost is one
   **priority-3** assertion (`listBoundary`). **Recommended: follow QDS and drop it**, because
   adding `navbar.list` and `navbar.listitem` for a p3 assertion is two parts for very little, and
   the `<nav>` landmark plus button names carry the structure. Recorded so the choice is visible.
3. **What names the `<nav>`?** aria-at makes the region name priority 1 and QDS ships no default.
   **Recommended: no default `aria-label`** — an invented "Navigation" is a name that says nothing
   and cannot be distinguished from a second navbar — **plus a dev-mode diagnostic** when the root
   has neither `aria-label` nor `aria-labelledby`. That matches how the family already treats
   naming elsewhere and avoids radio group's dangling-IDREF mistake in the other direction.
4. **Does a hover-open delay survive SSR resume?** N5. No family shipped so far uses a timer, and
   `research-popover.md` R13 records the gap. **This wants a spike before navbar is scheduled**,
   because a navbar with `hover={true}` — the default — is unusable if the delay misbehaves after
   resume.
5. **Can `navbar.item` root a popover instance while being seeded by the navbar root?** The
   composition is the family's premise. The nearest evidence is the projected-widget row in
   `widget-shared.test.ts`; the exact shape is unproven. Blocks the design if the answer is no.
6. **Ordering: popover first.** Navbar cannot land before popover, and its API is only fully
   decidable once popover's parts and props are fixed. Recorded as a scheduling fact, not a
   question.
