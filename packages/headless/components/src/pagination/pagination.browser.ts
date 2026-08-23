import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import { pageRange } from './pagination-range.ts';
import Basic from './scenarios/basic.tsrx';
import Clamped from './scenarios/clamped.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Links from './scenarios/links.tsrx';
import Products from './scenarios/products.tsrx';
import SinglePage from './scenarios/single-page.tsrx';
import TwoWidgets from './scenarios/two-widgets.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

// Colocated browser suite for the pagination family. Each test renders a
// realistic consumer scenario, and the locators name the part anatomy: root,
// item, itemtrigger, itemlink, forwardtrigger, backtrigger.
//
// The `pageRange` rows live here rather than in a plain unit file because the
// package's browser project includes `src/**/*.browser.ts` only - a
// `pagination-range.test.ts` beside the function would never be run by anything.
const Root = page.getByTestId('root');
const Back = page.getByTestId('backtrigger');
const Forward = page.getByTestId('forwardtrigger');
const Heading = page.getByTestId('heading');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const Page = page.getByTestId('page');
// The two paginations on one page, each part role prefixed by its subject.
const FirstRoot = page.getByTestId('first-root');
const SecondRoot = page.getByTestId('second-root');
const SecondForward = page.getByTestId('second-forwardtrigger');

// A row that asserts the same thing in both modes runs once per mode. The SSR
// harness rewrites a literal SSR mount call site, so the mount cannot be passed
// by reference or wrapped in a helper - the branch below keeps both call sites
// literal, which is why this idiom rather than a `mount` parameter.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function at(testId: string): HTMLElement {
	const found = document.querySelector(`[data-testid="${testId}"]`);
	if (!found) throw new Error(`Expected [data-testid="${testId}"] to be on the page.`);
	return found as HTMLElement;
}

/** Every page control the loop rendered, in document order. */
function triggers(): HTMLElement[] {
	return Array.from(document.querySelectorAll('[data-testid="itemtrigger"]'));
}

function renderedPages(): string[] {
	return triggers().map((control) => control.getAttribute('data-page') ?? '');
}

function ellipsisCount(): number {
	return document.querySelectorAll('[data-testid="ellipsis"]').length;
}

function clickPage(value: number): void {
	const control = triggers().find((each) => each.getAttribute('data-page') === String(value));
	if (!control) throw new Error(`Expected a control for page ${value} to be rendered.`);
	control.click();
}

/** Which controls claim to be the current page. One, or the family is broken. */
function currentControls(): Element[] {
	return Array.from(document.querySelectorAll('[aria-current]'));
}

function expectOnlyCurrent(testId: string): void {
	const current = currentControls();
	expect(current.length).toBe(1);
	expect(current[0]).toBe(at(testId));
	expect(current[0]?.getAttribute('aria-current')).toBe('page');
}

// --- the page range -------------------------------------------------------
//
// A plain function of three numbers, ported from the QDS reference's shipped
// arithmetic rather than from the prose around it - the reference's own research
// document quotes two different thresholds for where the second gap starts, so
// the rows below pin what the code does.

function pages(entries: ReturnType<typeof pageRange>): Array<number | '...'> {
	return entries.map((entry) => (entry.type === 'page' ? entry.value : '...'));
}

test('pageRange: no pages at all is an empty range', () => {
	expect(pageRange(1, 0)).toEqual([]);
});

test('pageRange: one page is one entry and no gap', () => {
	expect(pages(pageRange(1, 1))).toEqual([1]);
});

test('pageRange: a count that fits shows every page', () => {
	// count <= 2 * siblingCount + 5, so there is nothing a gap could hide.
	expect(pages(pageRange(1, 7, 1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
	expect(pages(pageRange(4, 7, 1))).toEqual([1, 2, 3, 4, 5, 6, 7]);
});

test('pageRange: the first page shows a head run and one gap', () => {
	expect(pages(pageRange(1, 20, 1))).toEqual([1, 2, 3, 4, 5, '...', 20]);
});

test('pageRange: the last page shows one gap and a tail run', () => {
	expect(pages(pageRange(20, 20, 1))).toEqual([1, '...', 16, 17, 18, 19, 20]);
});

test('pageRange: the middle shows two gaps around the siblings', () => {
	expect(pages(pageRange(10, 20, 1))).toEqual([1, '...', 9, 10, 11, '...', 20]);
});

test('pageRange: no siblings shows the current page alone between the gaps', () => {
	expect(pages(pageRange(10, 20, 0))).toEqual([1, '...', 10, '...', 20]);
});

test('pageRange: two siblings widen the middle run', () => {
	expect(pages(pageRange(10, 20, 2))).toEqual([1, '...', 8, 9, 10, 11, 12, '...', 20]);
});

test('pageRange: a gap never stands for a single page', () => {
	// The exact flip pages, pinned. The head gap first appears at page 4, because
	// at page 3 the page it would hide is page 2 and the page itself is better
	// than a gap standing for it. The tail gap is gone by page 18 for the mirror
	// reason: `rightSibling < count - 1`, not `count - 2`.
	expect(pages(pageRange(3, 20, 1))).toEqual([1, 2, 3, 4, 5, '...', 20]);
	expect(pages(pageRange(4, 20, 1))).toEqual([1, '...', 3, 4, 5, '...', 20]);
	expect(pages(pageRange(17, 20, 1))).toEqual([1, '...', 16, 17, 18, '...', 20]);
	expect(pages(pageRange(18, 20, 1))).toEqual([1, '...', 16, 17, 18, 19, 20]);
});

test('pageRange: every entry carries a key, and the keys are unique within a range', () => {
	// The key is what lets a consumer write `key entry.key` instead of `key i`. A
	// duplicate inside one range would collapse two rows into one, so uniqueness is
	// the part worth pinning, at every page of a long count.
	for (let showing = 1; showing <= 20; showing += 1) {
		const keys = pageRange(showing, 20, 1).map((entry) => entry.key);
		expect(keys.every((key) => key.length > 0)).toBe(true);
		expect(new Set(keys).size).toBe(keys.length);
	}
});

test('pageRange: a page keeps its key as the range slides, and a gap keeps its side', () => {
	// This is the whole point of the field: the same page is the same row across
	// two different ranges, so it is reconciled rather than rebuilt. Page 20 is the
	// tail on both, and page 1 the head.
	expect(pageRange(1, 20, 1).map((entry) => entry.key)).toEqual([
		'page:1',
		'page:2',
		'page:3',
		'page:4',
		'page:5',
		'ellipsis-trailing',
		'page:20',
	]);
	expect(pageRange(10, 20, 1).map((entry) => entry.key)).toEqual([
		'page:1',
		'ellipsis-leading',
		'page:9',
		'page:10',
		'page:11',
		'ellipsis-trailing',
		'page:20',
	]);
	// The lone gap of a head-run range is the TRAILING one, and the lone gap of a
	// tail-run range is the LEADING one, so a gap never changes sides under a row.
	expect(pageRange(20, 20, 1).map((entry) => entry.key)).toEqual([
		'page:1',
		'ellipsis-leading',
		'page:16',
		'page:17',
		'page:18',
		'page:19',
		'page:20',
	]);
});

test('pageRange: the range is seven entries wide at every page of a long count', () => {
	// Worth pinning because it is easy to assume the range shrinks at the ends. It
	// does not - what changes is how many of the seven are pages and how many are
	// gaps, which is exactly the shape the looped scenario exercises.
	for (let showing = 1; showing <= 20; showing += 1) {
		expect(pageRange(showing, 20, 1).length).toBe(7);
	}
});

// --- rendered anatomy -----------------------------------------------------

function expectBasicRendered() {
	// The one non-negotiable ARIA fact of this family: the root is a navigation
	// landmark, and a landmark on a page that has several of them carries a name.
	// The QDS reference's spec promises this and its shipped code omits it.
	expect(el(Root).tagName).toBe('NAV');
	expect(el(Root).getAttribute('aria-label')).toBe('Pagination');

	// Page 1 is showing, so exactly one control says so - and it says it with
	// `aria-current="page"`, the token WAI-ARIA defines for this exact case.
	expectOnlyCurrent('itemtrigger-1');
	// Absent, never "false". `aria-current="false"` is valid and means the same
	// thing, and no library in the survey writes it.
	expect(at('itemtrigger-2').hasAttribute('aria-current')).toBe(false);
	expect(at('itemtrigger-5').hasAttribute('aria-current')).toBe(false);

	// The item box carries the styling flag; the control carries the ARIA.
	expect(at('item-1').getAttribute('ui-active')).toBe('');
	expect(at('item-2').hasAttribute('ui-active')).toBe(false);

	// Page 1 has nothing before it, and native `disabled` takes the control out of
	// the tab order rather than leaving a focusable dead end.
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(false);

	// Every control is a real button, so Enter and Space already work.
	expect(at('itemtrigger-1').getAttribute('type')).toBe('button');
	expect(el(Back).getAttribute('type')).toBe('button');
	// The step controls are named, because their content is usually an arrow.
	expect(el(Back).getAttribute('aria-label')).toBe('Previous page');
	expect(el(Forward).getAttribute('aria-label')).toBe('Next page');

	// No live region anywhere: the content changed because the person asked for
	// it, and announcing the nav on top of that is the anti-pattern.
	expect(el(Root).hasAttribute('aria-live')).toBe(false);
}

function expectSinglePageRendered() {
	// One page is both the first and the last, so both step controls are shut at
	// once - the boundary a family that only checks one end gets wrong.
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(true);
	expectOnlyCurrent('itemtrigger-1');
}

function expectClampedRendered() {
	// page={99} over count={20} shows page 20, seeded - not only after a click.
	expectOnlyCurrent('itemtrigger-20');
	expect(el(Forward).hasAttribute('disabled')).toBe(true);
	expect(el(Back).hasAttribute('disabled')).toBe(false);
}

function expectDisabledRendered() {
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(true);
	expect(at('itemtrigger-3').hasAttribute('disabled')).toBe(true);
	// The consumer wrote `disabled={false}` on this one. The family writes its own
	// `disabled` after the spread, so the family wins and the control stays shut.
	expect(at('itemtrigger-2').hasAttribute('disabled')).toBe(true);
	// The consumer wrote `aria-current="page"` on a page nobody is on. Same rule,
	// same outcome: the family's `undefined` after the spread removes it.
	expect(at('itemtrigger-4').hasAttribute('aria-current')).toBe(false);
	expectOnlyCurrent('itemtrigger-3');
	// An anchor has no `disabled` attribute, so it reports aria-disabled instead
	// and stays where a reader can find it.
	expect(at('itemlink-5').getAttribute('aria-disabled')).toBe('true');
	expect(at('itemlink-5').hasAttribute('disabled')).toBe(false);
}

function expectDisabledDoesNotMove() {
	at('itemtrigger-2').click();
	expectOnlyCurrent('itemtrigger-3');
	at('itemlink-5').click();
	expectOnlyCurrent('itemtrigger-3');
}

function expectLinksRendered() {
	// Real URLs, kept exactly as written: this is the part that exists so a
	// crawler can follow pagination and a person can open page 3 in a new tab.
	expect(at('itemlink-1').tagName).toBe('A');
	expect(at('itemlink-1').getAttribute('href')).toBe('#page-1');
	expect(at('itemlink-4').getAttribute('href')).toBe('#page-4');
	expectOnlyCurrent('itemlink-2');
	// Nothing is unavailable here, so no link claims to be.
	expect(at('itemlink-1').hasAttribute('aria-disabled')).toBe(false);
}

function expectTwoWidgetsRendered() {
	// Both roots are named navigation landmarks.
	expect(el(FirstRoot).tagName).toBe('NAV');
	expect(el(SecondRoot).getAttribute('aria-label')).toBe('Pagination');

	// Two paginations, two pages, no shared cell between them.
	expect(at('first-itemtrigger-1').getAttribute('aria-current')).toBe('page');
	expect(at('second-itemtrigger-2').getAttribute('aria-current')).toBe('page');
	expect(currentControls().length).toBe(2);
}

function expectProductsRendered() {
	// pageRange(1, 20, 1) is 1 2 3 4 5, a gap, 20: six controls and one gap.
	expect(renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);
	expect(ellipsisCount()).toBe(1);
	// The gap is the consumer's own span, and it is hidden from a reader: exposed
	// it announces "horizontal ellipsis", which is not information.
	expect(at('ellipsis').getAttribute('aria-hidden')).toBe('true');
	expect(el(Heading).textContent).toContain('Page 1 of 20');
	expectOnlyCurrent('itemtrigger');
}

// --- gestures -------------------------------------------------------------

async function expectClickingAPageMovesCurrent() {
	at('itemtrigger-3').click();
	await expect.poll(() => at('itemtrigger-3').getAttribute('aria-current')).toBe('page');
	// The old current gave the attribute up, and nothing else picked it up.
	expect(at('itemtrigger-1').hasAttribute('aria-current')).toBe(false);
	expect(currentControls().length).toBe(1);
	// The item box followed too.
	expect(at('item-3').getAttribute('ui-active')).toBe('');
	expect(at('item-1').hasAttribute('ui-active')).toBe(false);
	// Page 3 of 5 has pages on both sides.
	expect(el(Back).hasAttribute('disabled')).toBe(false);
	expect(el(Forward).hasAttribute('disabled')).toBe(false);
}

async function expectStepControlsWalkToTheBounds() {
	el(Forward).click();
	await expect.poll(() => at('itemtrigger-2').getAttribute('aria-current')).toBe('page');
	expect(el(Back).hasAttribute('disabled')).toBe(false);

	at('itemtrigger-5').click();
	await expect.poll(() => at('itemtrigger-5').getAttribute('aria-current')).toBe('page');
	// The last page has nothing after it.
	await expect.poll(() => el(Forward).hasAttribute('disabled')).toBe(true);

	el(Back).click();
	await expect.poll(() => at('itemtrigger-4').getAttribute('aria-current')).toBe('page');
	await expect.poll(() => el(Forward).hasAttribute('disabled')).toBe(false);
}

async function expectConsumerCallbackFires() {
	// Nothing fired on mount, first render or resume.
	expect(el(Calls).textContent).toBe('0');
	expect(el(Page).textContent).toBe('');
	expect(el(Order).textContent).toBe('');

	at('itemtrigger-2').click();
	await expect.poll(() => el(Page).textContent).toBe('2');
	// Called once, with the new page number.
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The consumer's own click handler on the trigger runs after the page has
	// already moved and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
}

async function expectTheCurrentPageFiresNothing() {
	at('itemtrigger-2').click();
	await expect.poll(() => el(Calls).textContent).toBe('1');

	// Going where you already are is not a page change.
	at('itemtrigger-2').click();
	await expect.poll(() => el(Order).textContent).toBe('change-click-click');
	expect(el(Calls).textContent).toBe('1');
	expect(el(Page).textContent).toBe('2');
}

async function expectStepControlsReportThroughTheSameCallback() {
	at('itemtrigger-3').click();
	await expect.poll(() => el(Calls).textContent).toBe('1');

	el(Back).click();
	await expect.poll(() => el(Page).textContent).toBe('2');
	await expect.poll(() => el(Calls).textContent).toBe('2');

	el(Forward).click();
	await expect.poll(() => el(Page).textContent).toBe('3');
	await expect.poll(() => el(Calls).textContent).toBe('3');
}

async function expectOmittedCallbackStillMoves() {
	at('itemtrigger-3').click();
	await expect.poll(() => at('itemtrigger-3').getAttribute('aria-current')).toBe('page');
	expect(el(Calls).textContent).toBe('0');
}

async function expectEachWidgetKeepsItsOwnPage() {
	el(SecondForward).click();
	await expect.poll(() => at('second-itemtrigger-3').getAttribute('aria-current')).toBe('page');
	// The click landed in one widget only.
	expect(at('first-itemtrigger-1').getAttribute('aria-current')).toBe('page');
	expect(currentControls().length).toBe(2);

	at('first-itemtrigger-2').click();
	await expect.poll(() => at('first-itemtrigger-2').getAttribute('aria-current')).toBe('page');
	expect(at('second-itemtrigger-3').getAttribute('aria-current')).toBe('page');
}

async function expectLinkMovesTheCurrentPage() {
	at('itemlink-3').click();
	await expect.poll(() => at('itemlink-3').getAttribute('aria-current')).toBe('page');
	expect(at('itemlink-2').hasAttribute('aria-current')).toBe(false);
	// The href is untouched by the move.
	expect(at('itemlink-3').getAttribute('href')).toBe('#page-3');
}

// The demanding one: the SET of rendered controls changes as the page moves, not
// only their attributes. Six controls and one gap become five and two gaps, and
// then six and one again - rows leaving a keyed loop and coming back, with an
// arm inside each row deciding which of the two shapes it is.
async function expectTheRenderedRowSetFollowsThePage() {
	expect(renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);

	clickPage(5);
	await expect.poll(() => el(Heading).textContent).toContain('Page 5 of 20');
	await expect.poll(() => renderedPages()).toEqual(['1', '4', '5', '6', '20']);
	expect(ellipsisCount()).toBe(2);
	expect(currentControls().length).toBe(1);
	expect(currentControls()[0]?.getAttribute('data-page')).toBe('5');

	clickPage(20);
	await expect.poll(() => el(Heading).textContent).toContain('Page 20 of 20');
	await expect.poll(() => renderedPages()).toEqual(['1', '16', '17', '18', '19', '20']);
	expect(ellipsisCount()).toBe(1);
	expect(currentControls()[0]?.getAttribute('data-page')).toBe('20');
	expect(el(Forward).hasAttribute('disabled')).toBe(true);

	clickPage(1);
	await expect.poll(() => renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);
	expect(ellipsisCount()).toBe(1);
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Calls).textContent).toBe('3');
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a named nav with one current page`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: a single page shuts both step controls`, async () => {
		if (mode === 'CSR') await render(SinglePage);
		else await renderSSR(SinglePage);
		expectSinglePageRendered();
	});

	// PINNED - a seeded page cannot be clamped, and the clamp cannot move to the
	// read side either. A component body may seed a shared cell only from a bare
	// prop or a constant (MARKLESS_SHARED_SEED_UNSUPPORTED refuses both
	// `pagination.page = Math.min(...)` and a component-local const holding it), so
	// the root cannot narrow `page` on the way in. Doing the clamp in the parts
	// instead - `Math.max(Math.min(pagination.page, pagination.count), 1) ===
	// item.value` - compiles and renders right, and then never refreshes: measured
	// on this base, every click row went red the moment the comparison stopped
	// being a plain cell read. Plain reads and live clicks are worth more than a
	// seeded out-of-range page, so this row stays pinned. `goTo()` still clamps
	// every write, so a pagination only sits out of range until the first gesture.
	test.fails(`${mode}: a page number past the end is clamped to the last page`, async () => {
		if (mode === 'CSR') await render(Clamped);
		else await renderSSR(Clamped);
		expectClampedRendered();
	});

	// PINNED - a consumer's own attribute cannot replace one the part writes before
	// the spread. `<nav aria-label="Pagination" {...rest}>` renders the family's
	// label even when `rest` carries the consumer's, so attribute order does not
	// decide who wins and the spread never overwrites. The family keeps the
	// spread-before-state order anyway, because that is what stops a consumer
	// overwriting aria-current and disabled; what it cannot yet offer is a
	// REPLACEABLE default, which is what a second pagination on a page needs.
	test.fails(`${mode}: a consumer aria-label replaces the default landmark name`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expect(el(FirstRoot).getAttribute('aria-label')).toBe('Reviews pages');
	});

	// PINNED - a destructured prop still reaches the element through `{...rest}`.
	// `PaginationItem` takes `value` out of its props and never writes it, and the
	// rendered box is `<div value="1">` all the same. Harmless in the DOM, wrong in
	// principle: a part's own configuration is not markup.
	// Flipped by the rest-binding spread fix (6d8f6818): destructured props are
	// excluded from {...rest}, so this asserts the shipped behavior now.
	test(`${mode}: a destructured prop does not reach the element`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expect(at('item-1').hasAttribute('value')).toBe(false);
	});

	test(`${mode}: a disabled pagination renders inert controls and does not move`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);
		expectDisabledRendered();
		expectDisabledDoesNotMove();
	});

	test(`${mode}: links render their hrefs and mark the current page`, async () => {
		if (mode === 'CSR') await render(Links);
		else await renderSSR(Links);
		expectLinksRendered();
	});

	test(`${mode}: two paginations are named apart and hold separate pages`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expectTwoWidgetsRendered();
	});

	// UN-PINNED. Both halves of the cause are fixed now: the loop keys on
	// `entry.key` (`keyPath: ["key"]`, `directSupported: true`), and
	// `rowScopedEdgeIds`
	// (packages/compiler/src/passes/public-render/ssr-module.ts) descends into a
	// branch arm's templates, so `<pagination.itemtrigger>` inside this row's `@if`
	// is row-scoped and the SSR render composes one instance per row instead of
	// refusing with MARKLESS_ROW_COMPONENT_INTERACTIVE.
	test(`${mode}: the looped scenario renders the range the consumer computed`, async () => {
		if (mode === 'CSR') await render(Products);
		else await renderSSR(Products);
		expectProductsRendered();
	});

	test(`${mode}: clicking a page moves aria-current and leaves one behind`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectClickingAPageMovesCurrent();
	});

	test(`${mode}: the step controls walk to both bounds and stop`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		await expectStepControlsWalkToTheBounds();
	});

	test(`${mode}: a click calls the consumer onChange once with the new page`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectConsumerCallbackFires();
	});

	test(`${mode}: clicking the page already showing calls nothing`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectTheCurrentPageFiresNothing();
	});

	test(`${mode}: back and forward report through the same callback`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		await expectStepControlsReportThroughTheSameCallback();
	});

	test(`${mode}: an omitted onChange moves the page anyway`, async () => {
		if (mode === 'CSR') await render(WithoutOnChange);
		else await renderSSR(WithoutOnChange);
		await expectOmittedCallbackStillMoves();
	});

	test(`${mode}: each pagination keeps its own page`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		await expectEachWidgetKeepsItsOwnPage();
	});

	test(`${mode}: a link click moves the current page`, async () => {
		if (mode === 'CSR') await render(Links);
		else await renderSSR(Links);
		await expectLinkMovesTheCurrentPage();
	});

	// RE-PINNED on a different, downstream cause. The row-scoping gap above is
	// gone: SSR now serves the whole range and its click DOES route - dispatch
	// matches the row-scoped record `r:page%3A5:c2:h2` and runs
	// `bound:symbol%3A0:component-edge%3A2[b=branch%3A0;k=repeat%3A0]` warm. What
	// the handler cannot do is land a write: measured right after the click and
	// again 200ms later, `calls` stays `0`, `aria-current` stays on page 1, and
	// the heading stays `Page 1 of 20`. CSR fails identically, and CSR never
	// loads `ssrModuleSource`, so the remaining cause is shared - the bound
	// symbol module for an edge scoped `[b=...;k=...]` carries the build-time
	// branch/repeat scope (packages/compiler/src/passes/symbol-resolver.ts
	// `boundSymbolId`) but no row value, so the body that runs cannot reach the
	// row instance the record named. Fixing it is a symbol-module/runtime change,
	// outside this family and outside the SSR emission pass.
	test.fails(`${mode}: the rendered controls follow the page as the range changes`, async () => {
		if (mode === 'CSR') await render(Products);
		else await renderSSR(Products);
		await expectTheRenderedRowSetFollowsThePage();
	});
}

// --- keyboard -------------------------------------------------------------
//
// There is no APG pattern for pagination and no keyboard contract to conform to:
// every control is an ordinary tab stop and nothing roves. What these rows prove
// is that the family does not get in the way of what a native button and a
// native anchor already do.

test('CSR: Tab reaches every page control in document order', async () => {
	await render(Basic);
	at('itemtrigger-1').focus();
	expect(document.activeElement).toBe(at('itemtrigger-1'));

	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(at('itemtrigger-2'));
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(at('itemtrigger-3'));
});

test('CSR: Tab skips a disabled step control', async () => {
	await render(Basic);
	// Page 1: back is natively disabled, so focus never lands on it. A person
	// infers unavailability from being on page 1, which is the trade every
	// library makes here.
	el(Back).focus();
	expect(document.activeElement).not.toBe(el(Back));
});

test('CSR: Space on a focused page control moves the page', async () => {
	await render(Basic);
	at('itemtrigger-3').focus();
	expect(document.activeElement).toBe(at('itemtrigger-3'));

	await userEvent.keyboard(' ');
	await expect.poll(() => at('itemtrigger-3').getAttribute('aria-current')).toBe('page');
	expect(at('itemtrigger-1').hasAttribute('aria-current')).toBe(false);
});

test('CSR: Enter on a focused page control moves the page', async () => {
	await render(Basic);
	at('itemtrigger-4').focus();
	expect(document.activeElement).toBe(at('itemtrigger-4'));

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => at('itemtrigger-4').getAttribute('aria-current')).toBe('page');
});

test('CSR: Enter on a focused step control steps one page', async () => {
	await render(Basic);
	el(Forward).focus();
	expect(document.activeElement).toBe(el(Forward));

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => at('itemtrigger-2').getAttribute('aria-current')).toBe('page');
});

// --- resume ---------------------------------------------------------------

test('SSR: the served page carries the current page and both bounds', async () => {
	await renderSSR(Basic);
	// What the server sent, before anything on the client has run.
	expectOnlyCurrent('itemtrigger-1');
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(false);

	// And the first click after resume moves both the current page and the bound.
	at('itemtrigger-5').click();
	await expect.poll(() => at('itemtrigger-5').getAttribute('aria-current')).toBe('page');
	await expect.poll(() => el(Forward).hasAttribute('disabled')).toBe(true);
	await expect.poll(() => el(Back).hasAttribute('disabled')).toBe(false);
	expect(at('itemtrigger-1').hasAttribute('aria-current')).toBe(false);
});

// RE-PINNED on the post-click half only. The served half is now GREEN and stays
// asserted below: the server no longer refuses with
// MARKLESS_ROW_COMPONENT_INTERACTIVE, so the range and the single gap arrive on
// the page exactly as the consumer computed them. What still fails is the same
// downstream cause as the row above - the first click after resume routes to the
// row-scoped record but its bound symbol lands no write, so the row SET never
// changes.
test.fails('SSR: the served looped range is the one the consumer computed', async () => {
	await renderSSR(Products);
	expect(renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);
	expect(ellipsisCount()).toBe(1);

	// The first click after resume changes the row SET, not only the attributes.
	clickPage(5);
	await expect.poll(() => renderedPages()).toEqual(['1', '4', '5', '6', '20']);
	expect(ellipsisCount()).toBe(2);
});
