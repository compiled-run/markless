import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import './scenarios/scenario.css';
import Basic from './scenarios/basic.tsrx';
import BothAxes from './scenarios/both-axes.tsrx';
import NamedByHandle from './scenarios/named-by-handle.tsrx';
import NamedByHeading from './scenarios/named-by-heading.tsrx';
import NoOverflow from './scenarios/no-overflow.tsrx';
import ReleaseNotes from './scenarios/release-notes.tsrx';
import SpreadFirst from './scenarios/spread-first.tsrx';
import TwoAreas from './scenarios/two-areas.tsrx';

// Colocated browser suite for the scroll-area family. Each test renders a
// realistic consumer scenario, and the locators name the part anatomy: root,
// viewport, scrollbar, thumb.
const Root = page.getByTestId('root');
const Viewport = page.getByTestId('viewport');
const Scrollbar = page.getByTestId('scrollbar');
const Thumb = page.getByTestId('thumb');
const Heading = page.getByTestId('heading');
// The area with a scrollbar on each axis.
const VerticalScrollbar = page.getByTestId('vertical-scrollbar');
const VerticalThumb = page.getByTestId('vertical-thumb');
const HorizontalScrollbar = page.getByTestId('horizontal-scrollbar');
const HorizontalThumb = page.getByTestId('horizontal-thumb');
// Two areas on one page.
const FirstRoot = page.getByTestId('first-root');
const FirstViewport = page.getByTestId('first-viewport');
const FirstThumb = page.getByTestId('first-thumb');
const SecondRoot = page.getByTestId('second-root');
const SecondViewport = page.getByTestId('second-viewport');
const SecondThumb = page.getByTestId('second-thumb');

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

// The thumb rows below need CSS scroll-driven animations. Chromium has shipped
// them since 115, but the row is gated rather than assumed so the suite stays
// honest on a runner without them.
const SCROLL_TIMELINES =
	typeof CSS !== 'undefined' &&
	CSS.supports('animation-timeline', 'scroll()') &&
	CSS.supports('timeline-scope', '--name');

function scrollTopOf(locator: { element(): Element | null }) {
	return el(locator).scrollTop;
}

// --- the anatomy ----------------------------------------------------------

function expectTheViewportIsReachableAndNamed() {
	// The family's one hard accessibility obligation: a scroll container with no
	// focusable children is unreachable by keyboard without this pair.
	expect(el(Viewport).getAttribute('tabindex')).toBe('0');
	expect(el(Viewport).getAttribute('role')).toBe('region');
	expect(el(Viewport).getAttribute('aria-label')).toBe('Parking rules');

	// The root is a plain box. It carries no state, so it reflects none.
	expect(el(Root).hasAttribute('role')).toBe(false);
	expect(el(Root).hasAttribute('tabindex')).toBe(false);
	expect([...el(Root).attributes].some((a) => a.name.startsWith('ui-'))).toBe(false);
	expect(el(Root).contains(el(Viewport))).toBe(true);
}

function expectTheContentOverflows() {
	const viewport = el(Viewport);
	expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
}

function expectNoNameIsInvented() {
	// The deliberate break with QDS, which hard-codes `aria-label="Scrollable
	// content"` on every viewport: three areas on a page then announce three
	// identically named landmarks, which is what a name exists to prevent.
	expect(el(Viewport).hasAttribute('aria-label')).toBe(false);
	expect(el(Viewport).hasAttribute('aria-labelledby')).toBe(false);
	expect(el(Viewport).hasAttribute('title')).toBe(false);
}

function expectSpreadCannotDisplaceThePart() {
	// Each part spreads `{...rest}` first, so its own attributes land last.
	expect(el(Viewport).getAttribute('role')).toBe('region');
	expect(el(Viewport).getAttribute('tabindex')).toBe('0');
	expect(el(Scrollbar).getAttribute('aria-hidden')).toBe('true');
	expect(el(Thumb).getAttribute('aria-hidden')).toBe('true');
	// A consumer attribute that collides with nothing still arrives.
	expect(el(Root).getAttribute('data-owner')).toBe('consumer');
	expect(el(Viewport).getAttribute('data-owner')).toBe('consumer');
	expect(el(Scrollbar).getAttribute('data-owner')).toBe('consumer');
	expect(el(Thumb).getAttribute('data-owner')).toBe('consumer');
}

function expectThePaintIsHiddenFromReaders() {
	// A painted scrollbar sits on top of a control that is already operable by
	// keyboard, wheel, touch and find-in-page. Exposed, it would be a second,
	// redundant scrollbar in the tree - which is also why neither part carries
	// `role="scrollbar"`.
	expect(el(Scrollbar).getAttribute('aria-hidden')).toBe('true');
	expect(el(Thumb).getAttribute('aria-hidden')).toBe('true');
	expect(el(Scrollbar).hasAttribute('role')).toBe(false);
	expect(el(Thumb).hasAttribute('role')).toBe(false);
	expect(el(Scrollbar).hasAttribute('aria-valuenow')).toBe(false);
	expect(el(Scrollbar).hasAttribute('aria-orientation')).toBe(false);

	// One named container under the root, not three.
	expect(el(Root).querySelectorAll('[role="region"]').length).toBe(1);
	expect(el(Root).querySelectorAll('[aria-label]').length).toBe(1);
}

function expectTheOrientationIsAPresenceAttribute() {
	expect(el(VerticalScrollbar).hasAttribute('ui-vertical')).toBe(true);
	expect(el(VerticalScrollbar).hasAttribute('ui-horizontal')).toBe(false);
	expect(el(HorizontalScrollbar).hasAttribute('ui-horizontal')).toBe(true);
	expect(el(HorizontalScrollbar).hasAttribute('ui-vertical')).toBe(false);
	// `orientation` is the part's own prop and never reaches the element.
	expect(el(VerticalScrollbar).hasAttribute('orientation')).toBe(false);
	expect(el(HorizontalScrollbar).hasAttribute('orientation')).toBe(false);
}

function expectTheTwoThumbsAreDistinct() {
	// The QDS reference assigns both thumbs to one shared ref, so the second to
	// render overwrites the first and the vertical thumb stops being
	// distinguishable from its own track.
	expect(el(VerticalThumb)).not.toBe(el(HorizontalThumb));
	expect(el(VerticalScrollbar).contains(el(VerticalThumb))).toBe(true);
	expect(el(VerticalScrollbar).contains(el(HorizontalThumb))).toBe(false);
	expect(el(HorizontalScrollbar).contains(el(HorizontalThumb))).toBe(true);
	expect(el(HorizontalScrollbar).contains(el(VerticalThumb))).toBe(false);
}

function expectTwoAreasAreNamedApart() {
	expect(el(FirstViewport).getAttribute('aria-label')).toBe('Open incidents');
	expect(el(SecondViewport).getAttribute('aria-label')).toBe('Resolved incidents');
	expect(el(FirstRoot).contains(el(SecondRoot))).toBe(false);
	expect(el(FirstRoot).contains(el(SecondViewport))).toBe(false);
}

for (const mode of MODES) {
	test(`${mode}: the starter is a named, keyboard-reachable scroll container`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectTheViewportIsReachableAndNamed();
		expectTheContentOverflows();
	});

	test(`${mode}: an unnamed viewport gets no invented name`, async () => {
		if (mode === 'CSR') await render(SpreadFirst);
		else await renderSSR(SpreadFirst);
		expectNoNameIsInvented();
	});

	test(`${mode}: a consumer prop cannot displace tabindex, role or aria-hidden`, async () => {
		if (mode === 'CSR') await render(SpreadFirst);
		else await renderSSR(SpreadFirst);
		expectSpreadCannotDisplaceThePart();
	});

	test(`${mode}: the painted scrollbar and thumb are hidden from readers`, async () => {
		if (mode === 'CSR') await render(ReleaseNotes);
		else await renderSSR(ReleaseNotes);
		expectThePaintIsHiddenFromReaders();
	});

	test(`${mode}: a viewport named by a heading points at that heading's id`, async () => {
		if (mode === 'CSR') await render(NamedByHeading);
		else await renderSSR(NamedByHeading);
		const named = el(Viewport).getAttribute('aria-labelledby');
		const heading = el(Heading).getAttribute('id');
		expect(named).toBeTruthy();
		expect(heading).toBeTruthy();
		expect(named).toBe(heading);
		expect(el(Viewport).hasAttribute('aria-label')).toBe(false);
	});

	// An `element()` handle passed to a part as an attribute now reaches the
	// element. The consumer renders the heading, so the consumer mints the id and
	// hands it across the component edge as a string; the part's `{...rest}`
	// writes it like any other attribute value. `named-by-heading.tsrx` keeps the
	// hand-written-id spelling working alongside it.
	test(`${mode}: a viewport named by a heading handle mints the IDREF`, async () => {
		if (mode === 'CSR') await render(NamedByHandle);
		else await renderSSR(NamedByHandle);
		const named = el(Viewport).getAttribute('aria-labelledby');
		expect(named).toBeTruthy();
		expect(named).toBe(el(Heading).getAttribute('id'));
	});

	test(`${mode}: each scrollbar says its own axis and neither owns the other's thumb`, async () => {
		if (mode === 'CSR') await render(BothAxes);
		else await renderSSR(BothAxes);
		expectTheOrientationIsAPresenceAttribute();
		expectTheTwoThumbsAreDistinct();
	});

	test(`${mode}: two areas on one page are named apart and nested apart`, async () => {
		if (mode === 'CSR') await render(TwoAreas);
		else await renderSSR(TwoAreas);
		expectTwoAreasAreNamedApart();
	});

	test(`${mode}: content shorter than the viewport keeps the keyboard path`, async () => {
		if (mode === 'CSR') await render(NoOverflow);
		else await renderSSR(NoOverflow);
		expect(el(Viewport).getAttribute('tabindex')).toBe('0');
		expect(el(Viewport).getAttribute('role')).toBe('region');
		expect(el(Viewport).getAttribute('aria-label')).toBe('Delivery note');
		expect(el(Viewport).scrollHeight).toBeLessThanOrEqual(el(Viewport).clientHeight);
	});
}

// --- the viewport is a real scroller --------------------------------------
//
// The single most important behavioural claim in the family: nothing here
// intercepts the wheel, re-implements momentum, or handles a key. These rows
// prove the native scroller was left alone.

test('CSR: ArrowDown with the viewport focused scrolls it', async () => {
	await render(Basic);
	el(Viewport).focus();
	expect(document.activeElement).toBe(el(Viewport));
	expect(scrollTopOf(Viewport)).toBe(0);

	await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
	await expect.poll(() => scrollTopOf(Viewport)).toBeGreaterThan(0);
});

test('CSR: End with the viewport focused reaches the bottom', async () => {
	await render(Basic);
	el(Viewport).focus();

	await userEvent.keyboard('{End}');
	const viewport = el(Viewport);
	await expect
		.poll(() => viewport.scrollTop)
		.toBeGreaterThan(viewport.scrollHeight - viewport.clientHeight - 2);
});

test('CSR: scrolling one area leaves the other where it was', async () => {
	await render(TwoAreas);
	el(FirstViewport).scrollTop = 60;

	await expect.poll(() => scrollTopOf(FirstViewport)).toBe(60);
	expect(scrollTopOf(SecondViewport)).toBe(0);
});

// --- the family registers nothing -----------------------------------------

test('CSR: rendering the family registers no document pointer, wheel or resize listener', async () => {
	const original = document.addEventListener;
	const seen: string[] = [];
	document.addEventListener = function (this: Document, type: string, ...rest: unknown[]) {
		seen.push(type);
		return (original as (...args: unknown[]) => void).call(this, type, ...rest);
	} as typeof document.addEventListener;

	try {
		await render(TwoAreas);
	} finally {
		document.addEventListener = original;
	}

	// The QDS reference registers `mousemove` and `mouseup` on the document for
	// every thumb on the page whether or not anything is being dragged, plus
	// `resize`, `wheel` and `keydown` for its overflow check. This family
	// registers no handler at all, so none of them can appear. `click` and the
	// framework's own delegation are deliberately not asserted here: they are
	// not this family's to promise.
	for (const type of ['mousemove', 'mouseup', 'pointermove', 'pointerup', 'wheel', 'resize'])
		expect(seen).not.toContain(type);
});

test('CSR: scrolling writes nothing to the markup', async () => {
	await render(ReleaseNotes);
	const before = el(Root).outerHTML;

	el(Viewport).scrollTop = 80;
	await expect.poll(() => scrollTopOf(Viewport)).toBe(80);

	// The thumb moves through the animation, which is computed style rather than
	// a written attribute; QDS writes `thumb.style.transform` on every scroll
	// event. Nothing in this tree is rewritten.
	expect(el(Root).outerHTML).toBe(before);
});

// --- the thumb is positioned by CSS ---------------------------------------

test.skipIf(!SCROLL_TIMELINES)('CSR: the thumb follows the viewport with no JavaScript', async () => {
	await render(ReleaseNotes);
	const thumb = el(Thumb);
	expect(getComputedStyle(thumb).top).toBe('0px');

	const viewport = el(Viewport);
	viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
	await expect.poll(() => Number.parseFloat(getComputedStyle(thumb).top)).toBeGreaterThan(1);

	viewport.scrollTop = 0;
	await expect.poll(() => getComputedStyle(thumb).top).toBe('0px');
});

test.skipIf(!SCROLL_TIMELINES)('CSR: each axis drives its own thumb', async () => {
	await render(BothAxes);
	const viewport = el(Viewport);
	const vertical = el(VerticalThumb);
	const horizontal = el(HorizontalThumb);

	viewport.scrollTop = viewport.scrollHeight - viewport.clientHeight;
	await expect.poll(() => Number.parseFloat(getComputedStyle(vertical).top)).toBeGreaterThan(1);
	// A vertical scroll must not move the horizontal thumb: this is where the QDS
	// shared thumb reference gets the two confused.
	expect(getComputedStyle(horizontal).left).toBe('0px');

	viewport.scrollLeft = viewport.scrollWidth - viewport.clientWidth;
	await expect.poll(() => Number.parseFloat(getComputedStyle(horizontal).left)).toBeGreaterThan(1);
});

test.skipIf(!SCROLL_TIMELINES)('CSR: two areas resolve the same timeline name separately', async () => {
	await render(TwoAreas);
	const first = el(FirstViewport);

	first.scrollTop = first.scrollHeight - first.clientHeight;
	await expect.poll(() => Number.parseFloat(getComputedStyle(el(FirstThumb)).top)).toBeGreaterThan(1);
	// The second area put the SAME timeline name in scope and its thumb still
	// reads its own viewport, which has not moved.
	expect(getComputedStyle(el(SecondThumb)).top).toBe('0px');
});

test.skipIf(!SCROLL_TIMELINES)('CSR: a viewport with nothing to scroll leaves the thumb at the top', async () => {
	await render(NoOverflow);
	const viewport = el(Viewport);
	expect(viewport.scrollHeight).toBeLessThanOrEqual(viewport.clientHeight);
	expect(getComputedStyle(el(Thumb)).top).toBe('0px');
});

test('CSR: the painted scrollbar leaves no native gutter in the viewport', async () => {
	await render(ReleaseNotes);
	const viewport = el<HTMLElement>(Viewport);
	// `scrollbar-width: none` is the required CSS every library in the field
	// ships with a painted scrollbar; without it the area gets two.
	expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
	expect(viewport.offsetWidth - viewport.clientWidth).toBe(0);
});

// --- SSR ------------------------------------------------------------------
//
// Tiers 1 and 2 have no client state at all, which makes this the cheapest SSR
// case in the package: the served HTML already scrolls, is reachable and is
// named, with the bundle never loading.

test('SSR: the served markup is already a named, scrollable, reachable region', async () => {
	await renderSSR(Basic);
	const viewport = el(Viewport);
	expect(viewport.getAttribute('tabindex')).toBe('0');
	expect(viewport.getAttribute('role')).toBe('region');
	expect(viewport.getAttribute('aria-label')).toBe('Parking rules');
	expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
});

test('SSR: nothing moves after resume', async () => {
	await renderSSR(ReleaseNotes);
	const served = el(Root).outerHTML;

	// There is no gesture and no state in this family, so resume has nothing to
	// restore. Give the page a turn anyway and assert the markup did not move.
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(el(Root).outerHTML).toBe(served);
});

test('SSR: the served area scrolls by keyboard', async () => {
	await renderSSR(Basic);
	el(Viewport).focus();
	expect(document.activeElement).toBe(el(Viewport));

	await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
	await expect.poll(() => scrollTopOf(Viewport)).toBeGreaterThan(0);
});
