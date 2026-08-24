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

// The page number lives on the ITEM in every scenario; the control inside it takes
// none.
//
// The `pageRange` rows below import the internal module on purpose: the arithmetic
// deserves direct rows, and they live here rather than in a plain unit file because
// the package's browser project includes `src/**/*.browser.ts` only.
const Root = page.getByTestId('root');
const Back = page.getByTestId('backtrigger');
const Forward = page.getByTestId('forwardtrigger');
const Heading = page.getByTestId('heading');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const Page = page.getByTestId('page');
// The two paginations on one page, each part prefixed by its subject.
const FirstRoot = page.getByTestId('first-root');
const SecondRoot = page.getByTestId('second-root');
const SecondForward = page.getByTestId('second-forwardtrigger');

// Every item control on the page, whatever a scenario prefixed its test id with.
// `aria-current` is written by `itemtrigger` and `itemlink` and nowhere else, so
// this set is the whole population the current-page rows care about.
const ItemControls = page.getByTestId(/item(trigger|link)/);

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// `first()` because the looped scenario gives every rendered control the same test
// id, and these rows want the first one in document order.
function at(testId: string): HTMLElement {
	const found = page.getByTestId(testId).first().query();
	if (!found) throw new Error(`Expected [data-testid="${testId}"] to be on the page.`);
	return found as HTMLElement;
}

/** Every page control the loop rendered, in document order. */
function triggers(): HTMLElement[] {
	return page.getByTestId('itemtrigger').elements() as HTMLElement[];
}

function renderedPages(): string[] {
	return triggers().map((control) => control.getAttribute('data-page') ?? '');
}

function ellipsisCount(): number {
	return page.getByTestId('ellipsis').elements().length;
}

function clickPage(value: number): void {
	const control = triggers().find((each) => each.getAttribute('data-page') === String(value));
	if (!control) throw new Error(`Expected a control for page ${value} to be rendered.`);
	control.click();
}

/** Which controls claim to be the current page. One, or the family is broken. */
function currentControls(): Element[] {
	return ItemControls.elements().filter((control) => control.hasAttribute('aria-current'));
}

function expectOnlyCurrent(testId: string): void {
	const current = currentControls();
	expect(current.length).toBe(1);
	expect(current[0]).toBe(at(testId));
	expect(current[0]?.getAttribute('aria-current')).toBe('page');
}

// --- the page range -------------------------------------------------------

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
	// The head gap first appears at page 4: at page 3 the page it would hide is page
	// 2, and the page itself is better than a gap standing for it. The tail gap is
	// gone by page 18 for the mirror reason.
	expect(pages(pageRange(3, 20, 1))).toEqual([1, 2, 3, 4, 5, '...', 20]);
	expect(pages(pageRange(4, 20, 1))).toEqual([1, '...', 3, 4, 5, '...', 20]);
	expect(pages(pageRange(17, 20, 1))).toEqual([1, '...', 16, 17, 18, '...', 20]);
	expect(pages(pageRange(18, 20, 1))).toEqual([1, '...', 16, 17, 18, 19, 20]);
});

test('pageRange: every entry carries a key, and the keys are unique within a range', () => {
	// A duplicate key inside one range would collapse two rows into one.
	for (let showing = 1; showing <= 20; showing += 1) {
		const keys = pageRange(showing, 20, 1).map((entry) => entry.key);
		expect(keys.every((key) => key.length > 0)).toBe(true);
		expect(new Set(keys).size).toBe(keys.length);
	}
});

test('pageRange: a page keeps its key as the range slides, and a gap keeps its side', () => {
	// The same page is the same row across two different ranges, so a keyed loop
	// reconciles it rather than rebuilding it.
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
	// The range does not shrink at the ends: what changes is how many of the seven
	// entries are pages and how many are gaps.
	for (let showing = 1; showing <= 20; showing += 1) {
		expect(pageRange(showing, 20, 1).length).toBe(7);
	}
});

// --- rendered anatomy -----------------------------------------------------

function expectBasicRendered() {
	// The root is a navigation landmark, and a landmark on a page that has several of
	// them carries a name.
	expect(el(Root).tagName).toBe('NAV');
	expect(el(Root).getAttribute('aria-label')).toBe('Pagination');

	expectOnlyCurrent('itemtrigger-1');
	// Absent on the other pages, never "false".
	expect(at('itemtrigger-2').hasAttribute('aria-current')).toBe(false);
	expect(at('itemtrigger-5').hasAttribute('aria-current')).toBe(false);

	// The anatomy: the item is the box, the control lives inside it, and the page
	// number was written once - on the item. The control was told nothing.
	expect(at('itemtrigger-1').parentElement).toBe(at('item-1'));
	expect(at('itemtrigger-1').hasAttribute('value')).toBe(false);
	expect(at('itemtrigger-5').hasAttribute('value')).toBe(false);

	// The item box carries the styling flag; the control carries the ARIA.
	expect(at('item-1').getAttribute('ui-active')).toBe('');
	expect(at('item-2').hasAttribute('ui-active')).toBe(false);

	// Page 1 has nothing before it, and native `disabled` takes the control out of the
	// tab order rather than leaving a focusable dead end.
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(false);

	// Every control is a real button, so Enter and Space already work.
	expect(at('itemtrigger-1').getAttribute('type')).toBe('button');
	expect(el(Back).getAttribute('type')).toBe('button');
	// The step controls are named, because their content is usually an arrow.
	expect(el(Back).getAttribute('aria-label')).toBe('Previous page');
	expect(el(Forward).getAttribute('aria-label')).toBe('Next page');

	// No live region: the content changed because the person asked for it, and
	// announcing the nav on top of that is the anti-pattern.
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
	// The scenario says `disabled` once, on the root. Everything below is what the
	// family derived from that - no control on the page was told to be shut.
	expect(el(Root).getAttribute('ui-disabled')).toBe('');
	expect(el(Back).hasAttribute('disabled')).toBe(true);
	expect(el(Forward).hasAttribute('disabled')).toBe(true);
	expect(at('itemtrigger-2').hasAttribute('disabled')).toBe(true);
	expect(at('itemtrigger-3').hasAttribute('disabled')).toBe(true);
	expect(at('itemtrigger-4').hasAttribute('disabled')).toBe(true);
	// And the current page is derived too: page 3 is showing, so the control
	// inside the item that declared 3 is the one - and it is the only one.
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
	// Real URLs, kept exactly as written, so a crawler can follow pagination and a
	// person can open page 3 in a new tab.
	expect(at('itemlink-1').tagName).toBe('A');
	expect(at('itemlink-1').getAttribute('href')).toBe('#page-1');
	expect(at('itemlink-4').getAttribute('href')).toBe('#page-4');
	// Same anatomy as the button flavour: the item declares the page, the anchor
	// carries the href and is told no page number of its own.
	expect(at('itemlink-2').parentElement).toBe(at('item-2'));
	expect(at('itemlink-2').hasAttribute('value')).toBe(false);
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
	// The family's own range, read by the consumer as one zero-arg accessor: at
	// page 1 of 20 that is 1 2 3 4 5, a gap, 20 - six controls and one gap.
	expect(renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);
	expect(ellipsisCount()).toBe(1);
	// Every rendered control sits inside an item, in the loop too.
	expect(triggers().every((control) => control.parentElement?.dataset.testid === 'item')).toBe(
		true,
	);
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

	// Expected red, and narrowly. `getEntries()` does clamp, so a bookmarked
	// `?page=99` gets the last page's range; what stays unclamped is the comparison
	// that marks an item current, which is what this row asserts. A component body
	// may seed a shared cell only from a bare prop or a constant, so the root cannot
	// clamp on the way in, and clamping inside the parts turns the comparison into an
	// expression that renders once and never refreshes. Plain reads and live clicks
	// are worth more than a seeded out-of-range page.
	test.fails(`${mode}: a page number past the end is clamped to the last page`, async () => {
		if (mode === 'CSR') await render(Clamped);
		else await renderSSR(Clamped);
		expectClampedRendered();
	});

	// Expected red: a spread never overwrites an attribute written before it, so
	// `.
<nav aria-label="Pagination" {...rest}>` keeps the family's label even when
	// `rest` carries the consumer's. The family keeps that order because it is what
	// stops a consumer overwriting aria-current and disabled; what it cannot yet
	// offer is a REPLACEABLE default, which a second pagination on a page needs.
	test.fails(`${mode}: a consumer aria-label replaces the default landmark name`, async () => {
		if (mode === 'CSR') await render(TwoWidgets);
		else await renderSSR(TwoWidgets);
		expect(el(FirstRoot).getAttribute('aria-label')).toBe('Reviews pages');
	});

	// `PaginationItem` takes `value` out of its props, so it is not in `{...rest}` and
	// must not reach the box: a part's own configuration is not markup.
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

	// A consumer callback held on the widget-root's shared instance only reaches the
	// consumer when the part that dispatches is a DIRECT child of the root part. One
	// more component level in between and the write still lands - the page moves and
	// aria-current follows - while `pagination.onChange?.(next)` reaches nobody. The
	// routing lives in the compiler's shared-callback wiring, not in these parts.
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

	// The step controls themselves ARE direct children of the root, so their half
	// of this row routes; it opens by clicking a page control, which does not.
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

	// Expected red: a click inside a keyed row lands nothing at all - not the write,
	// not the callback. The two flat cases bound the cause. In `Basic` the same
	// `item > itemtrigger` nesting outside a loop moves aria-current on click; in
	// `WithOnChange`, flat, the write lands and only the callback is lost. Here, both
	// inside a keyed row AND one part deeper than the root's direct children, neither
	// arrives. The item part's projection site is registered in the root's subtree
	// while the dispatching part is spelled in the consumer's, so the item's shared
	// id stays in page space; that registration gap lives in composition's projection
	// bridge, not in this family.
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
	// Page 1: back is natively disabled, so focus never lands on it.
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

// Expected red on the post-click half only: the served range arrives exactly as the
// family computed it, and then the first click after resume lands nothing, for the
// row-dispatch reason named above.
test.fails('SSR: the served looped range is the one the consumer computed', async () => {
	await renderSSR(Products);
	expect(renderedPages()).toEqual(['1', '2', '3', '4', '5', '20']);
	expect(ellipsisCount()).toBe(1);

	// The first click after resume changes the row SET, not only the attributes.
	clickPage(5);
	await expect.poll(() => renderedPages()).toEqual(['1', '4', '5', '6', '20']);
	expect(ellipsisCount()).toBe(2);
});
