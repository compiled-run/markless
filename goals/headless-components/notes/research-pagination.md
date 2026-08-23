# Pagination — component research for `@markless/ui`

**Research date:** 2026-08-22
**Method:** `.ruler/skills/markless-component-research/SKILL.md`
**QDS reference read:** `~/dev/open-source/qwik-design-system/libs/components/src/pagination/`
(READ-ONLY) — source, plus its own `research.md` (dated 2026-03-02) and `spec.md`.
**Markless facts read from:** this worktree, cut from `feat/headless-ui-pilot` @ `30c5f92f`.
Framework-limit statements are quoted from `packages/headless/components/src/checklist/note.md`.

**Inheritance warning, stated up front.** QDS's pagination folder ships a 994-line `research.md` and
a 412-line `spec.md`. They are excellent and this document leans on them — but they are **dated
2026-03-02 and were not re-verified library-by-library this session.** Every claim below carries its
provenance: *verified 2026-08-22* means this session fetched it; *QDS research (2026-03)* means it
is inherited and should not be cited as current. Two of QDS's inherited claims turned out to
disagree with QDS's own shipped code (§2), which is the reason for the discipline.

**Cluster note.** This document carries the consolidated §8 for the tranche-5 cluster (otp,
pagination, scroll-area, qr-code): what the four families need from the framework, which is very
close to nothing, and why.

---

## 1. Name and alternates

Searched under: pagination, paginator, pager, page navigation, pagelist, page control, page picker,
"load more", infinite scroll.

- **Pagination** is the settled name. QDS `pagination`, Ark UI `Pagination`, Kobalte `Pagination`,
  Bits UI `Pagination`, Melt UI `createPagination`, MUI `usePagination`, shadcn `Pagination`. No
  library ships it under another name.
- **"Pager" and "paginator"** appear in older CSS frameworks (Bootstrap 3's `.pager`) and in
  server-side template languages. Dead names; nothing to learn from them.
- **"Load more" and infinite scroll are different patterns.** They replace pagination rather than
  implement it, they have no page model and no `aria-current`, and their accessibility problem is a
  live region for "20 more results loaded" — a problem this family does not have. Out of scope, and
  worth one line in docs so nobody expects `pagination.forwardtrigger` to append.
- **Alternative-named implementations worth crediting:**
  - **`solid-primitives`' `createPagination`** returns reactive accessors rather than components
    (`pages`, `page`, `setPage`, `hasPrevPage`, `hasNextPage`) — *QDS research (2026-03)*. The shape
    matters to us because it is the closest existing thing to the design §7 recommends: the page
    range is a **pure function**, and the components are just markup over it.
  - **MUI's `usePagination`** is the only implementation with `boundaryCount` — *QDS research
    (2026-03)*. Its output mixes navigation items into the page array (`"previous"`, `"next"`,
    `"first"`, `"last"` as string literals), which is exactly the shape a compound-component family
    should not have.
  - **CSS `::scroll-marker-group`** (§4) is the platform arriving at an adjacent problem — a
    generated set of "go to item N" controls with no JavaScript. It solves carousel dots, not data
    pagination, but it is the one place the platform is moving and it belongs in this document.

**Recommendation: keep the QDS name `pagination`.**

---

## 2. QDS reference (naming truth)

Folder listing — this *is* the part inventory:

```
pagination-root.tsx           pagination-item.tsx
pagination-item-trigger.tsx   pagination-item-link.tsx
pagination-forward-trigger.tsx  pagination-back-trigger.tsx
utils.ts   utils.unit.ts   index.ts   pagination.browser.tsx   research.md   spec.md
```

`index.ts`:

```ts
export { PaginationRoot as root }                   from "./pagination-root";
export { PaginationItem as item }                   from "./pagination-item";
export { PaginationItemTrigger as itemtrigger }     from "./pagination-item-trigger";
export { PaginationItemLink as itemlink }           from "./pagination-item-link";
export { PaginationForwardTrigger as forwardtrigger } from "./pagination-forward-trigger";
export { PaginationBackTrigger as backtrigger }     from "./pagination-back-trigger";
export { paginationContextId as contextId }         from "./pagination-root";

const context = createContextProxy<PaginationContext>();
export const getEntries   = context("entries");
export const getPage      = context("page");
export const getDisabled  = context("disabled");
```

**Six parts: root, item, itemtrigger, itemlink, forwardtrigger, backtrigger** — plus three *context
getters*, which are not parts and have no Markless equivalent (§7). **There is no ellipsis part**:
the consumer renders `<span aria-hidden="true">…</span>` themselves, which QDS's `spec.md` argues
for explicitly ("no separate component needed since it carries no state, no context, and no complex
ARIA"). That reasoning is sound and we should copy it.

### What QDS actually implements

Read from the code, not from `spec.md`.

| Concern | QDS behaviour |
| --- | --- |
| Root props | `page`, `count`, `siblingCount`, `disabled`, `onChange$`, plus `bind:*` for the first four via `useBindings` (`pagination-root.tsx:42-56`) |
| Page clamping | a task clamps `page` into `[1, max(count,1)]` whenever either changes (`pagination-root.tsx:63-70`) |
| Entries | `useComputed$` over the clamped page → `getPageRange(page, count, siblingCount)` (`utils.ts`) |
| Root element | `<nav>` via `Render fallback="nav"`, `styleBoundary`, `ui-qds-pagination-root`, `ui-disabled` |
| Item | `<div>`, computes `isCurrent = page === value`, provides an item context, writes `ui-active={isCurrent.value}` |
| Item trigger | `<button>`, click sets `page = itemContext.value`, `disabled={context.disabled ‖ undefined}`, `aria-current={isCurrent ? "page" : undefined}` |
| Item link | `<a>`, click sets the page unless disabled, `aria-current`, `aria-disabled={disabled ‖ undefined}` |
| Back trigger | `<button>`, `page = max(page-1, 1)`, `disabled` when `page <= 1` or root disabled, `aria-label` defaulting to `"Previous page"` |
| Forward trigger | the mirror (file read as present; symmetric to back per `spec.md` and `index.ts`) |

### Five things in QDS worth not copying — three of them are defects

1. **The `<nav>` has no `aria-label`.** `spec.md` says the root "Renders `<nav aria-label="Pagination">`"
   and its HTML sample shows it. `pagination-root.tsx:94-104` does not set it. This is the *one*
   accessibility requirement every source in §4 agrees on — a page can have several `<nav>` landmarks
   and each must be distinguishable — and the shipped code omits it while the spec claims it. **The
   code is the judge, and the code is wrong.** We set it, with a default and an override.
2. **`aria-current` is on the trigger, not the item — and `spec.md` says the opposite.** `spec.md`'s
   ARIA table and HTML sample put `aria-current="page"` on `pagination.item`
   (`<div aria-current="page" ui-qds-pagination-item>`); `pagination-item.tsx` writes only
   `ui-active`, and `pagination-item-trigger.tsx` / `pagination-item-link.tsx` write `aria-current`.
   The code is right (the current-ness belongs on the focusable control a reader lands on) and the
   spec is stale. Recorded because anyone porting from the QDS docs will port the wrong one.
3. **`{...props}` is spread LAST on `itemtrigger`, `itemlink` and `backtrigger`.** In all three the
   spread comes after `aria-current`, `disabled` and `aria-label`, so a consumer prop silently
   overwrites the family's own accessibility attributes. Our `{...rest}`-first rule fixes it; this is
   the same finding as QDS tabs and the collapsible root.
4. **`ui-active={isCurrent.value}` is a raw boolean** where every other QDS attribute in the family
   uses `x ? "" : undefined`. Inside the same folder, `ui-disabled={disabled.value ‖ undefined}` and
   `ui-qds-pagination-item` follow the presence idiom and `ui-active` does not. Our presence-attribute
   convention removes the inconsistency by construction.
5. **The shipped `getPageRange` does not match the algorithm its own research quotes.** `utils.ts`
   uses `showRight = rightSibling < count - 1`; the zag-js algorithm quoted in QDS's `research.md`
   uses `rightSiblingIndex < totalPages - 2` in one place and `totalPages - 1` in another, inside
   the same document. The threshold decides whether a single skipped page is rendered as an ellipsis
   or as the page itself, so it is a real behavioural difference, and `utils.unit.ts` exists to pin
   whichever QDS chose. **Take the shipped `utils.ts` as the reference and pin it with our own unit
   rows**, rather than re-deriving from the prose.

### The one QDS mechanism with no Markless equivalent

`createContextProxy` + `getEntries` / `getPage` / `getDisabled` are **context getters**: a consumer
imports `getEntries` and maps over `getEntries.value` to render items. It is a second public surface
alongside the parts, and it exists because the page range has to leave the root and reach the
consumer's markup. We have no such surface and should not invent one (§7 answers it with a plain
exported function).

---

## 3. Headless library survey

Verification column is deliberate.

| Library | Has it? | Parts | Page model | Verified |
| --- | --- | --- | --- | --- |
| **Base UI** | **no** | — | — | fetched `base-ui.com/llms.txt`, 2026-08-22 — the 47-component index has no Pagination |
| **Ark UI** (zag `pagination`) | yes | `Root`, `Item`, `Ellipsis`, `PrevTrigger`, `NextTrigger` | `count` = **total items** + `pageSize` | existence and doc URL verified 2026-08-22 via `ark-ui.com/llms.txt`; part list and props are *QDS research (2026-03)* |
| **Kobalte** | yes | `Root`, `Item`, `Ellipsis`, `Previous`, `Next` | `count` = **total pages**; `showFirst`/`showLast`/`fixedItems` | *QDS research (2026-03)* |
| **Melt UI** | yes (builder) | element builders, no components | `count` = total items + `perPage`; exposes a `range` `{start,end}` | *QDS research (2026-03)* |
| **Bits UI** | yes | `Root`, `Page`, `PrevButton`, `NextButton`, `Ellipsis` | `count` = total items + `perPage` | *QDS research (2026-03)* |
| **solid-primitives** | yes (primitive) | none — returns accessors | `count` = total items | *QDS research (2026-03)* |
| **Radix UI** | **no** | — | — | *QDS research (2026-03)*, corroborated 2026-08-22: shadcn's pagination is hand-written markup, not a Radix primitive (§5) |
| **React Aria** | **no** dedicated component | — | — | *QDS research (2026-03)* |
| **Ariakit / Corvu / Headless UI / Dice UI** | **not verified** | — | — | not fetched this session |
| **QDS** | yes | `root`, `item`, `itemtrigger`, `itemlink`, `forwardtrigger`, `backtrigger` | `count` = **total pages** | source read 2026-08-22 |
| **shadcn/ui** | yes (markup only) | `Pagination`, `PaginationContent`, `PaginationItem`, `PaginationLink`, `PaginationEllipsis`, `PaginationPrevious`, `PaginationNext` | none — no page model at all | grep, 2026-08-22 (§5) |

Consensus, and where QDS sits:

- **Three tier-1 libraries do not ship pagination at all** (Base UI, Radix, React Aria — the first
  verified this session). That is a real signal about the pattern: its interaction model is "buttons
  in a nav", and the only hard part is the page-range arithmetic, which is a pure function. It is
  also why shadcn ships pagination as **markup with no logic** and lets the consumer compute pages.
- **`aria-current="page"` on the active control is unanimous** among the libraries that ship it, and
  §5 shows the wild agrees.
- **Nobody uses roving tabindex.** Every page control is an ordinary tab stop. *QDS research
  (2026-03)* checked zag, Kobalte and Bits UI explicitly; nothing found this session contradicts it.
- **Nobody puts a live region on the pagination nav.** The user pressed the button; the content
  update is expected. If loading is slow, the live region belongs on the content, which is the
  consumer's.
- **The page-range output is a discriminated union everywhere**: `{type:'page',value} | {type:'ellipsis'}`
  (zag, Melt, Bits, QDS) or the simpler `number | 'ellipsis'` (solid-primitives).
- **The one axis libraries genuinely disagree on is `count`**: total *pages* (Kobalte, QDS) or total
  *items* + a page size (zag/Ark, Melt, Bits, solid-primitives). QDS's `spec.md` argues for total
  pages — "pagination is navigation, not data slicing" — and that argument is right for a headless
  family: items-per-page is the consumer's data layer, and a component that takes it has to be told
  about the data twice.

---

## 4. Specifications and expert commentary

### There is no APG pattern

`w3.org/WAI/ARIA/apg/patterns/` has no pagination pattern. There is no role and no keyboard contract
to conform to — pagination is a `<nav>` landmark containing ordinary buttons or links, and the
correctness question is entirely about naming and current-ness.

### aria-at coverage: none

The 40 test-plan folders under `w3c/aria-at/tests/apg` (listed in full in `research-otp.md` §4, read
2026-08-22 via the GitHub API) contain **no pagination plan**. There is therefore no
community-vetted assertion set for this family. §6 derives expectations from semantics and says so.

### What the specs do fix

- **`aria-current`** (WAI-ARIA 1.2, §`aria-current`): the token `page` is defined precisely for
  "a link within a set of pagination links, where the link is visually styled to represent the
  currently-displayed page". This is the one place the spec names our exact use case.
- **`<nav>` requires a distinguishing label when a page has more than one.** A page with a site nav,
  a breadcrumb and a pagination has three navigation landmarks; without labels a reader lists three
  identical entries.
- **`aria-hidden="true"` on the ellipsis.** It carries visual information and no interactive
  information; exposed, it reads as "horizontal ellipsis" or "dot dot dot" depending on the reader
  and the character.

### Expert commentary (inherited, attributed)

*QDS research (2026-03)* cites two Adrian Roselli posts and uses them correctly:

- **"aria-selected vs aria-current" (2022-03)** — `aria-selected` belongs to selection widgets
  (tabs, listbox, grid) where items are part of a selection model; `aria-current` marks "you are
  here" in a navigation set. Pagination is navigation. `aria-selected` on a page button is an
  anti-pattern.
- **"Don't turn your list into a listbox" (2022-11)** — `role="listbox"` on a set of page controls
  makes readers announce options and expect arrow-key navigation, which the widget does not
  implement. Use a list of links/buttons.

Neither post was re-fetched this session; both are cited here as inherited, and both are consistent
with everything §3 and §5 show.

### The platform is moving next door

CSS Overflow Level 5 ships `::scroll-marker`, `::scroll-marker-group`, `::scroll-button()` and
`:target-current` — a generated, keyboard-navigable set of "jump to item N" controls with **no
JavaScript at all** (verified 2026-08-22 by grep: MDN's own `dom-examples/css-carousels/`, biome's
CSS-analyzer fixture listing them as valid pseudo-elements, and several production stylesheets;
the `Luko248/css-first-skill` demo records "Baseline: Experimental, Chrome 135+").

This does **not** replace data pagination — scroll markers navigate items already in the scroller,
not pages fetched from a server — but it is worth naming for two reasons. It is the right answer for
the *carousel dots* use case people will try to build with `pagination`, and it is the second
appearance in this cluster of "the platform grew a feature that deletes a JavaScript widget" (the
first is `scrollbar-*`, `research-scroll-area.md` §4). Our docs should point carousel-dot users at
`::scroll-marker-group` rather than at us.

---

## 5. GitHub patterns (grep MCP)

Searches run: `(?s)aria-label="Pagination".*aria-current` (TSX, regex). Findings:

- **The dominant real-world implementation is shadcn's, and it has no page model.** The same file
  appears in shadcn/ui itself (three registry bases: `new-york-v4`, `bases/aria`, and the v4
  examples), fastapi's `full-stack-fastapi-template`, mem0, OpenCut, AFFiNE, CopilotKit, cal.diy,
  ruflo and awesome-llm-apps. Its shape is fixed:
  ```tsx
  <nav aria-label="pagination" data-slot="pagination" ...>
    <ul data-slot="pagination-content">
      <li data-slot="pagination-item">…</li>
  ```
  with `PaginationLink` taking `isActive` and setting `aria-current={isActive ? "page" : undefined}`,
  and `PaginationEllipsis` rendering `aria-hidden`. **The ellipsis policy and the page range are the
  consumer's problem in every one of those repositories.** That is the market's revealed preference:
  people want the markup and the ARIA, and they compute the pages themselves.
- **`aria-label="pagination"` is lowercase in the whole shadcn lineage**, and the QDS spec's
  capitalised `"Pagination"` is the minority spelling. It is announced verbatim, so this is a
  user-visible string. Recommendation in §7: `"Pagination"` capitalised, because it is announced as
  a landmark name and reads as a proper label; note that we are choosing against the more common
  spelling, deliberately.
- **`<ul>` beats `<ol>` in practice.** Every shadcn-lineage file uses `<ul>`. *QDS research
  (2026-03)* prefers `<ol>` on the grounds that page numbers are ordered, and notes VoiceOver and
  NVDA treat both identically. Either is defensible; the wild has voted for `<ul>`, and our family
  should not force the choice at all (§7 makes the list the consumer's element).
- **The list wrapper is not a component part in the wild** — `PaginationContent` is a bare `<ul>`
  with a `data-slot`. It carries no state. Same conclusion as the ellipsis: not a part.
- **No `role="listbox"` pagination was found in this sample**, which is mildly good news against the
  Roselli anti-pattern; absence in one search is not evidence it does not happen.

---

## 6. Expected screen-reader behaviour

**No aria-at plan exists for this family** (§4), so these are derived from the semantics rather than
quoted from a vetted assertion set. They are still testable as accessibility-tree assertions.

**Sequence A — Land on the pagination by landmark navigation**
1. reader's landmark command (`D` in NVDA, VO rotor)
2. → "Pagination" → "navigation" / "landmark"

This is the row that fails today in QDS, because the label is not set (§2, defect 1). With three
landmarks on a page and no labels, the reader announces "navigation" three times and the user cannot
tell which is which.

**Sequence B — Tab to an inactive page control**
1. keypress `Tab`
2. → "7" (its content) → "button" (or "link")

**Sequence C — Tab to the active page control**
1. keypress `Tab`
2. → "5" → "current page" → "button"

The `aria-current="page"` announcement varies in wording by reader ("current page" on VoiceOver,
NVDA announces the current state as part of the control), which is why the suite must assert the
**attribute**, not a string.

**Sequence D — Tab past the ellipsis**
1. keypress `Tab`
2. → the next page control, with **nothing** announced for the ellipsis

An exposed ellipsis produces "horizontal ellipsis" (VoiceOver reading U+2026) or "dot dot dot"
(three periods). `aria-hidden="true"` is the fix and it belongs to the consumer's `<span>`, so it
belongs in our docs and in a scenario, not in our code.

**Sequence E — Reach a disabled previous control at page 1**
1. keypress `Tab`
2. → focus **skips it entirely**, because native `disabled` removes it from the tab order

This is the deliberate trade every library makes: the user cannot focus the control to learn why it
is unavailable, and infers it from being on page 1. The alternative (`aria-disabled` + a click guard)
keeps it focusable and announces "dimmed"/"unavailable". QDS uses native `disabled` on the button
triggers and `aria-disabled` on the *link*, which is correct — a link has no `disabled` attribute.

**Sequence F — Activate a page control**
1. `Enter` or `Space`
2. → nothing from us

We announce nothing on page change. The content changed because the user asked; if it loads
asynchronously, the live region belongs on the content area and is the consumer's. This is the
industry position and both zag and Kobalte hold it (*QDS research, 2026-03*).

---

## 7. Markless API design

### Parts

`pagination.root`, `pagination.itemtrigger`, `pagination.itemlink`, `pagination.forwardtrigger`,
`pagination.backtrigger`.

**`pagination.item` is dropped, and it is the API question this document most wants ruled on.**

The argument. QDS's `item` exists to do exactly one thing: hold the page number in an item context
so that `itemtrigger` and `itemlink`, written as its children by the consumer, can read it. Under
the Markless rule — parts resolve to the innermost enclosing root **of their family**, and there is
only one pagination root — a consumer-written child cannot read a value from a consumer-written
parent part. `checklist` solved the same problem by having `checklist.item` root a *second family's*
instance (a checkbox), which is not available here: there is no second family. So `item` cannot
carry the value, and the value has to go where it is used:

```tsx
<li><pagination.itemtrigger value={entry.value}>{entry.value}</pagination.itemtrigger></li>
```

The `<li>` is the consumer's, exactly as the ellipsis and the `<ul>` already are (§5 shows the whole
shadcn lineage doing this), and dropping `item` removes a part that would otherwise be a `<div>`
with a `value` prop that only exists to be repeated on its child.

The argument against, which the owner should weigh: it is a visible departure from the QDS folder
listing, and QDS's `ui-active` lived on `item`, so a consumer styling "the active page's box" now
styles from the trigger outward (`:has()`, or a wrapper class of their own). If that is unacceptable,
the alternative is to keep `item` and require `value` on **both** `item` and its trigger — honest,
but duplicated.

**No `ellipsis` part** (QDS has none, and its `spec.md` argues why). **No list wrapper part** (§5).

### The page range is a plain exported function, not a context getter

QDS's `getEntries` context proxy has no Markless equivalent and inventing one would be a new
authoring surface. It does not need one: the range is a pure function of three numbers.

```ts
// pagination-range.ts — no framework involvement, no compiler involvement
export type PageEntry = { type: 'page'; value: number } | { type: 'ellipsis' };
export function pageRange(page: number, count: number, siblingCount = 1): PageEntry[];
```

The consumer holds it in a `computed()` — a landed authoring API they already have — and loops:

```tsx
const entries = computed(() => pageRange(page.value, 20, 1));
…
<pagination.root count={20} page={page.value} onChange={(next) => { page.value = next; }}>
  <ul>
    @for (entry of entries) {
      @if (entry.type === 'page') {
        <li><pagination.itemtrigger value={entry.value}>{entry.value}</pagination.itemtrigger></li>
      } @else {
        <li aria-hidden="true">…</li>
      }
    }
  </ul>
</pagination.root>
```

This is the solid-primitives shape (§1), it is what the whole shadcn lineage does by hand (§5), and
it asks the framework for nothing. Port the **shipped `utils.ts`** arithmetic, not the prose (§2,
defect 5), and bring `utils.unit.ts`'s rows across as our own unit test.

### Types (`pagination-types.ts`)

```ts
import type { PropsOf, Seeded } from '@markless/core';

export type PaginationRootProps = Omit<PropsOf<'nav'>, 'onChange'> & {
	/** How many pages there are in total. */
	readonly count: number;
	/** Which page is showing, counting from 1. Omit it and it starts at page 1. */
	readonly page?: number;
	/** Nothing navigates while this is set. */
	readonly disabled?: boolean;
	/** Called with the new page number when a person moves to another page. */
	readonly onChange?: (page: number) => void;
};

export type PaginationItemTriggerProps = PropsOf<'button'> & {
	/** Which page this control goes to, counting from 1. */
	readonly value: number;
};

export type PaginationItemLinkProps = PropsOf<'a'> & {
	readonly value: number;
};

export type PaginationForwardTriggerProps = PropsOf<'button'>;
export type PaginationBackTriggerProps = PropsOf<'button'>;

export type PaginationInstanceState = Seeded<PaginationRootProps, 'count' | 'page' | 'disabled'> & {
	onChange?: (page: number) => void;
};
```

Notes on the shape:

- **`count` is total pages**, following QDS and Kobalte, against zag/Ark/Melt/Bits. QDS's argument is
  the right one and we should restate it in docs: pagination is navigation, and items-per-page is the
  consumer's data layer.
- **No `siblingCount` on the root**, because the root no longer computes the range — `pageRange()`
  takes it as an argument at the one call site that needs it. This is a real simplification the
  pure-function design buys.
- **No `bind:page`, no `defaultPage`**, per the standing no-controlled/uncontrolled-vocabulary
  ruling.
- **No `boundaryCount`, no `fixedItems`, no `range`.** QDS deferred all three and only one library
  each implements them (MUI, Kobalte, Melt respectively). `fixedItems` is the interesting one — it
  prevents layout shift as the range's length changes — and it is a CSS problem for a consumer
  (`min-width` on the list) before it is an algorithm problem.

### Instance and parts

```tsx
export const paginationState = shared(
	() => {
		const pagination: PaginationInstanceState = state({
			count: 1,
			page: 1,
			disabled: false,
		});

		return {
			...pagination,
			onChange: undefined as ((page: number) => void) | undefined,
			isCurrent(value: number): boolean {
				return pagination.page === value;
			},
			goTo(value: number) {
				if (pagination.disabled) return;
				const next = Math.min(Math.max(value, 1), Math.max(pagination.count, 1));
				if (next === pagination.page) return;
				pagination.page = next;
				pagination.onChange?.(next);
			},
		};
	},
	{ scope: 'widget' },
);

export function PaginationRoot({
	count,
	page = 1,
	disabled = false,
	onChange,
	children,
	...rest
}: PaginationRootProps) @{
	const pagination = paginationState();
	pagination.onChange = onChange;
	pagination.count = count;
	pagination.page = page;
	pagination.disabled = disabled;

	<nav {...rest} aria-label="Pagination" ui-disabled={pagination.disabled}>{children}</nav>
}

export function PaginationItemTrigger({ value, children, onClick, ...rest }: PaginationItemTriggerProps) @{
	const pagination = paginationState();
	const item = state({ value });

	<button
		{...rest}
		type="button"
		aria-current={pagination.isCurrent(item.value) ? 'page' : undefined}
		disabled={pagination.disabled}
		ui-active={pagination.isCurrent(item.value)}
		onClick={(event) => {
			pagination.goTo(item.value);
			onClick?.(event);
		}}
	>{children}</button>
}

export function PaginationBackTrigger({ children, onClick, ...rest }: PaginationBackTriggerProps) @{
	const pagination = paginationState();

	<button
		{...rest}
		type="button"
		aria-label="Previous page"
		disabled={pagination.disabled || pagination.page <= 1}
		onClick={(event) => {
			pagination.goTo(pagination.page - 1);
			onClick?.(event);
		}}
	>{children}</button>
}
```

`PaginationForwardTrigger` is the mirror (`aria-label="Next page"`, disabled at `page >= count`);
`PaginationItemLink` is `PaginationItemTrigger` over an `<a>`, with `aria-disabled` instead of
`disabled` because an anchor has no disabled attribute, and a click handler that returns early when
disabled.

Everything above uses only landed capabilities:

- `{...rest}` first everywhere, which fixes QDS's three spread-last parts by construction.
- `aria-label="Pagination"` before the spread, so a consumer's own `aria-label` on the root wins —
  a default that can be overridden, which is what QDS's spec promised and its code did not deliver.
- `pagination.isCurrent(item.value)` is a parameterised shared method over an item-local `state`
  cell — the `checklist.value.includes(item.value)` shape that ships today.
- Presence attributes only: `ui-active`, `ui-disabled`. No `ui-qds-*`, no `data-*`, no
  `ui-active="true"` string (§2, defect 4).

### What is not expressible today

| Wanted | Blocked by |
| --- | --- |
| `aria-current` on a consumer-written `<li>` wrapping the trigger | there is no part there; the consumer writes it, and `aria-current` belongs on the control anyway (§2, defect 2) |
| An `@for` written directly inside `<pagination.root>`'s children | `checklist/note.md` limit 7 — a construct cannot open directly inside a component tag's children. The `<ul>` in the sketch above is load-bearing, not decorative |
| A consumer prop spread onto `pagination.itemtrigger` that carries an event or an `el` handle *through* a component edge | `checklist/note.md` limit 1 — the spread reaches the element but records no graph binding |
| The root announcing "Page 3 of 10" on change | not wanted (§6, sequence F), and a live region on the nav is the anti-pattern QDS's own research argues against |

### Flippable arms

The `@if (entry.type === 'page')` in the consumer sketch is an arm inside a keyed `@for`, over data
that changes every time the page changes. That is the single most demanding shape in this document
and it is **not** new framework work — it is exactly what T075 and T075b landed and pinned
(`packages/vitest-browser/browser/widget-token-scalar-rows.test.ts`,
`widget-token-row-scoping.test.ts`). It does deserve a scenario and a red-first row (§9), because
this family will exercise it harder than checklist does: the row *set* changes, not just the row
values.

---

## 8. What the tranche-5 cluster needs from the framework

This is the consolidated section for otp, pagination, scroll-area and qr-code. The short answer:
**nothing new, if each family declares what QDS discovered.**

**1. The recurring requirement, refused for the fourth tranche running: a construction-order index.**

Three of the four families would generate it from QDS's design. QDS `otp` increments
`context.numItems++` in item construction order. QDS `pagination` does not need it (the value is a
prop) but its `getEntries` context getter is the same instinct — the root discovering what the
consumer will render. `research-checklist.md` §6b already recorded the refusal for checklist, tabs
and radio group, and the reason has not changed: the seed phase is order-independent by design, so
"which item am I" cannot come from when a part was constructed.

**The answer for all of them is declaration over discovery**, and each family pays a small, visible
price at the call site:

| Family | What QDS discovers | What we declare | Call-site cost |
| --- | --- | --- | --- |
| `otp` | `numItems`, per-item index | `length` on the root, `index` on each item | one number per box |
| `pagination` | the entries array, via a context getter | `count` on the root; the range is a plain function the consumer loops | one `computed()` in the consumer |
| `qr-code` | nothing — the matrix is computed from `value` | nothing | none |
| `scroll-area` | overflow, thumb geometry | nothing — CSS measures it (`research-scroll-area.md` §7) | none |

**2. Two limits every family in the package already pays, restated so they are not re-chartered
per family.** Both are quoted from `checklist/note.md`:

- **Limit 1 — a spread onto a component tag records no graph binding.** The spread reaches the
  element; a spread-forwarded event or `el` handle has no view record. Every family works around it
  by destructuring the handlers it composes.
- **Limit 6 — `MARKLESS_ELEMENT_HANDLE_IDREF_COMPOSITE` refuses an IDREF list.** No tranche-5 family
  needs one (none of them has a describedby/controls set), so this cluster does not add weight to
  that request — recorded so the next reader knows it was checked and is genuinely absent here.

**3. One thing this cluster does add, and it is small: `@for` over a set whose membership changes.**
Checklist loops over a fixed option list. Pagination loops over a set that gains and loses entries on
every page change, and OTP may loop over a length that flips in an arm. T075/T075b landed keyed-row
identity and T075g landed prop-following seeds; what is unproven is a row set *shrinking*. That is a
test row, not a charter (§9), and if it comes back red it is a defect report with a minimal witness,
not a design.

**4. Nothing in this cluster needs an overlay, a portal, focus management, or a dismiss protocol.**
After four tranches of families that did, that is worth stating plainly: tranche 5 is cheap, and it
is a good place to land the declaration-over-discovery convention as a documented rule rather than a
per-family argument.

---

## 9. Test plan

`packages/headless/components/src/pagination/pagination.browser.ts`, plus a plain unit file
`pagination-range.test.ts` for the pure function. Scenarios under `src/pagination/scenarios/`.
Part-role testids: `root`, `itemtrigger`, `itemlink`, `forwardtrigger`, `backtrigger`, item testids
suffixed by page number.

Unit rows for `pageRange()` — ported from QDS's `utils.unit.ts` and from `spec.md`'s edge-case table,
pinning the **shipped** thresholds (§2, defect 5):

| Input | Expected |
| --- | --- |
| `count=0` | `[]` |
| `count=1` | one page entry |
| `page=1, count=7, siblings=1` | seven pages, no ellipsis (`count <= 2*siblings+5`) |
| `page=1, count=20` | `1..5`, ellipsis, `20` |
| `page=20, count=20` | `1`, ellipsis, `16..20` |
| `page=10, count=20` | `1`, ellipsis, `9,10,11`, ellipsis, `20` |
| `page=10, count=20, siblings=0` | `1`, ellipsis, `10`, ellipsis, `20` |
| `page=10, count=20, siblings=2` | `1`, ellipsis, `8..12`, ellipsis, `20` |
| the exact page at which the second ellipsis first appears | the `count - 1` vs `count - 2` threshold; pin whichever the ported code does and say so in a comment |

Browser scenarios, starter first:

1. `basic.tsrx` — a root with `count={5}`, five triggers written out literally, back and forward.
2. `products.tsrx` — the realistic one: `count={20}`, a `computed()` over `pageRange`, a `@for` with
   an `@if` arm for the ellipsis, `<ul>`/`<li>` markup, a heading showing the current page.
3. `links.tsrx` — `pagination.itemlink` with real `href`s, for the MPA/SEO case.
4. `disabled.tsrx` — `disabled` on the root; every control inert.
5. `single-page.tsrx` — `count={1}`: both back and forward disabled at once.
6. `with-onchange.tsrx` / `without-onchange.tsrx` — the pair.
7. `two-widgets.tsrx` — two paginations on one page.

Rows that must exist, with why:

| Row | Why |
| --- | --- |
| the root is a `<nav>` carrying `aria-label="Pagination"` | QDS ships this **missing** (§2, defect 1); it is the family's one non-negotiable ARIA fact |
| a consumer `aria-label` on the root **wins** over the default | the spread-first convention, and the reason to have a default at all |
| exactly one control carries `aria-current="page"`, and it is the current page's | the WAI-ARIA-named use case |
| after clicking page 3, `aria-current` moved and no other control has it | the row that catches a stale current |
| `aria-current` is **absent**, not `"false"`, on inactive controls | `aria-current="false"` is valid ARIA and means "not current", but the wild and every library omit it; assert absence |
| the back trigger is natively `disabled` at page 1 and the forward trigger at page `count` | boundary behaviour, and the tab-order consequence in §6 sequence E |
| `{...rest}` cannot overwrite `aria-current` or `disabled` on a trigger | fixes QDS's spread-last defect; assert it |
| clicking a trigger fires `onChange` with the new page, once | the callback contract |
| clicking the **current** page's trigger fires nothing | the `next === page` early return; easy to regress |
| `page={99}` on `count={20}` clamps to 20 | QDS clamps in a task; ours clamps in `goTo` and on seeding — assert the seeded case too |
| **the row set shrinks**: navigate from page 10 (`1 … 9 10 11 … 20`, seven entries) to page 1 (`1 2 3 4 5 … 20`, six entries) and back | §8 item 3 — the keyed `@for` losing and regaining rows, the one genuinely new shape in this cluster |
| a consumer `onClick` runs **after** the page change | the closure-composition contract |
| two co-rendered paginations keep separate pages | widget-instance isolation |
| SSR + resume: the served HTML has the right `aria-current` and disabled boundaries, and the first click after resume moves both | tranche entry gate |
| the ellipsis `<span>` in the scenario is `aria-hidden` | not our code — a docs-and-scenario row, asserting the shape we tell people to write |

Mode loop: shared rows run once per mode with a literal `render`/`renderSSR` call site each. Explicit
SSR+resume rows for the served current page and the first post-resume click.

**Not tested, and why:** real navigation (`itemlink` following its `href`) is not driven in the
browser suite — the row asserts the `href` and the `aria-current`, and stops at the click guard. Say
so in the parity table rather than implying MPA pagination is covered.

---

## 10. Open questions

1. **Dropping `pagination.item`, moving `value` onto `itemtrigger`/`itemlink`.** Recommended: drop.
   The part cannot carry the value under our instance rules (§7), and the whole shadcn lineage
   already writes the `<li>` by hand. The owner should know it is a visible departure from the QDS
   folder listing and that `ui-active` moves from the box to the control.
2. **The page range as a plain exported function rather than any framework surface.** Recommended:
   yes — `pageRange(page, count, siblingCount)` plus the consumer's own `computed()`. It is not a new
   authoring API, it asks the framework for nothing, and it is what three of the surveyed
   implementations already do. Confirm, because it means our family ships *less* than QDS's: no
   `getEntries`, no `siblingCount` on the root.
3. **`aria-label="Pagination"` capitalised, as an overridable default.** Recommended: yes.
   Deliberately against the more common lowercase spelling (§5) because it is announced as a landmark
   name. One word of confirmation; it is a user-visible string.
4. **`count` = total pages, not total items.** Recommended: total pages, following QDS and Kobalte
   against zag/Ark/Melt/Bits. Recorded as a question because a consumer migrating from Ark UI will
   pass the wrong number and get a working-but-wrong widget, which argues for a loud name — the
   alternative spelling is `pageCount`.
5. **Porting the shipped `utils.ts` arithmetic, not the prose.** Recommended: port the code and pin
   the ellipsis threshold with our own unit rows, since QDS's own research document contradicts
   itself on it (§2, defect 5). No owner decision needed unless we want to *change* the threshold,
   which this document does not recommend.
6. **Landing order within tranche 5.** Recommended: qr-code first (no interaction at all), then
   pagination, then otp, then scroll-area — cheapest to hardest. Pagination second because it is the
   one that exercises the changing `@for` row set (§8 item 3), and finding that red early is worth
   more than finding it late.
