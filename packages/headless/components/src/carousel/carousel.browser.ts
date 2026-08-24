import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import GalleryAutoplay from './scenarios/gallery-autoplay.tsrx';
import Tabbed from './scenarios/tabbed.tsrx';
import TwoCarousels from './scenarios/two-carousels.tsrx';
import Untitled from './scenarios/untitled.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

// Colocated browser suite for the carousel family. The locators name the QDS
// part anatomy - root, title, scrollarea, item, backtrigger, forwardtrigger,
// navlist, navtrigger, playtrigger - prefixed per slide the way a consumer names
// their own slides.
const Root = page.getByTestId('root');
const Title = page.getByTestId('title');
const ScrollArea = page.getByTestId('scrollarea');
const NavList = page.getByTestId('navlist');
const BackTrigger = page.getByTestId('backtrigger');
const ForwardTrigger = page.getByTestId('forwardtrigger');
const PlayTrigger = page.getByTestId('playtrigger');
const ParisItem = page.getByTestId('paris-item');
const OsloItem = page.getByTestId('oslo-item');
const LimaItem = page.getByTestId('lima-item');
const ParisNav = page.getByTestId('paris-navtrigger');
const OsloNav = page.getByTestId('oslo-navtrigger');
const LimaNav = page.getByTestId('lima-navtrigger');
const TopItem = page.getByTestId('top-item');
const MiddleItem = page.getByTestId('middle-item');
// The consumer handler's log.
const Last = page.getByTestId('last');
const Calls = page.getByTestId('calls');
// Two carousels sharing slide values on purpose.
const LeftOne = page.getByTestId('left-one');
const LeftTwo = page.getByTestId('left-two');
const RightOne = page.getByTestId('right-one');
const RightTwo = page.getByTestId('right-two');
const LeftForward = page.getByTestId('left-forwardtrigger');

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

/** Which slide the carousel says is showing, read off the slides themselves. */
function activeValue() {
	const active = document.querySelector('[ui-active][ui-value]');
	return active?.getAttribute('ui-value') ?? '';
}

for (const mode of MODES) {
	test(`${mode}: the root carries the carousel role description and a polite live region`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const root = el(Root);
		expect(root.getAttribute('role')).toBe('group');
		expect(root.getAttribute('aria-roledescription')).toBe('carousel');
		expect(root.getAttribute('aria-live')).toBe('polite');
		expect(root.getAttribute('aria-atomic')).toBe('false');
	});

	test(`${mode}: a slide is a group with a slide role description, and the showing one is marked`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const paris = el(ParisItem);
		expect(paris.getAttribute('role')).toBe('group');
		expect(paris.getAttribute('aria-roledescription')).toBe('slide');
		expect(paris.hasAttribute('ui-active')).toBe(true);
		expect(el(OsloItem).hasAttribute('ui-active')).toBe(false);
	});

	// The APG's off-screen-slide warning: a slide wrongly hidden on the server is
	// content the reader never gets, and nothing has measured layout yet.
	test(`${mode}: every slide is present, none hidden and none inert`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		for (const slide of [ParisItem, OsloItem, LimaItem]) {
			const node = el(slide);
			expect(node.hasAttribute('hidden')).toBe(false);
			expect(node.hasAttribute('inert')).toBe(false);
		}
	});

	test(`${mode}: an untitled carousel carries no name rather than a bad one`, async () => {
		if (mode === 'CSR') await render(Untitled);
		else await renderSSR(Untitled);

		const root = el(Root);
		expect(root.hasAttribute('aria-label')).toBe(false);
		expect(root.hasAttribute('aria-labelledby')).toBe(false);
	});

	test(`${mode}: the forward trigger steps to the next slide and the back trigger returns`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await userEvent.click(el(ForwardTrigger));
		await expect.poll(activeValue).toBe('oslo');

		await userEvent.click(el(BackTrigger));
		await expect.poll(activeValue).toBe('paris');
	});

	test(`${mode}: the ends stop, because this carousel neither loops nor rewinds`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await userEvent.click(el(BackTrigger));
		await expect.poll(activeValue).toBe('paris');

		await userEvent.click(el(ForwardTrigger));
		await userEvent.click(el(ForwardTrigger));
		await expect.poll(activeValue).toBe('lima');

		await userEvent.click(el(ForwardTrigger));
		await expect.poll(activeValue).toBe('lima');
	});

	test(`${mode}: the triggers are named for what they do`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(BackTrigger).getAttribute('aria-label')).toBe('Previous slide');
		expect(el(ForwardTrigger).getAttribute('aria-label')).toBe('Next slide');
	});

	// Pinned: defect 78-adjacent. Same measured cause as the row below - the
	// stepping handler throws before the engine is reached.
	test.fails(`${mode}: a vertical carousel says so and still steps`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);

		expect(el(Root).hasAttribute('ui-vertical')).toBe(true);
		expect(el(TopItem).hasAttribute('ui-active')).toBe(true);

		await userEvent.click(el(ForwardTrigger));
		await expect.poll(() => el(MiddleItem).hasAttribute('ui-active')).toBe(true);
	});

	// Pinned: defect 78, and the cause is now measured - it is NOT the keyed-loop
	// instance seat that defect 75 stood on, so the row-rooted widget lookup does
	// not move it. Nothing clears the other carousel's marker: the LEFT trigger
	// never steps at all, because its handler throws
	//
	//   Element handle …#carouselState/element:scrollEl is registered by 2
	//   rendered widgets on this page, and the reading handler named no instance.
	//
	// A widget-scoped element() handle keeps its module-level id, while the graph
	// nodes of the same widget are spelled against the widget ROOT's edge path by
	// the time a part reads them. So the graph half resolves and the handle half
	// has only the reading part's own edge path to go on - `c4:` for the forward
	// trigger, against roots at `c0:` and `c5:` - and `carousel.root` binds no
	// handle of its own, so `widgetRootPath` cannot answer for the trigger's host
	// either. Fixing it needs a bridge from a dispatching host to the rendered
	// widget it stands inside that does not depend on that host binding a handle.
	test.fails(`${mode}: a trigger in one carousel leaves the other alone`, async () => {
		if (mode === 'CSR') await render(TwoCarousels);
		else await renderSSR(TwoCarousels);

		expect(el(LeftOne).hasAttribute('ui-active')).toBe(true);
		expect(el(RightOne).hasAttribute('ui-active')).toBe(true);

		await userEvent.click(el(LeftForward));
		await expect.poll(() => el(LeftTwo).hasAttribute('ui-active')).toBe(true);
		expect(el(LeftOne).hasAttribute('ui-active')).toBe(false);
		expect(el(RightOne).hasAttribute('ui-active')).toBe(true);
		expect(el(RightTwo).hasAttribute('ui-active')).toBe(false);
	});

	test(`${mode}: the consumer's onChange is called once per change, with the new value`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		expect(el(Calls).textContent).toBe('0');

		await userEvent.click(el(ForwardTrigger));
		await expect.poll(() => el(Last).textContent).toBe('oslo');
		expect(el(Calls).textContent).toBe('1');

		// Already at the end: nothing changes, so nothing is announced.
		await userEvent.click(el(ForwardTrigger));
		await expect.poll(() => el(Calls).textContent).toBe('1');
	});
}

test('the title is rendered and the carousel keeps its own heading', async () => {
	await render(Basic);

	expect(el(Title).textContent).toContain('Featured destinations');
});

test('the nav list is a tab list and its pickers are tabs', async () => {
	await render(Tabbed);

	expect(el(NavList).getAttribute('role')).toBe('tablist');
	expect(el(ParisNav).getAttribute('role')).toBe('tab');
	expect(el(ParisNav).getAttribute('aria-selected')).toBe('true');
	expect(el(OsloNav).getAttribute('aria-selected')).toBe('false');
	expect(el(ParisNav).getAttribute('tabindex')).toBe('0');
	expect(el(OsloNav).getAttribute('tabindex')).toBe('-1');
});

test('clicking a picker shows its slide', async () => {
	await render(Tabbed);

	await userEvent.click(el(LimaNav));
	await expect.poll(activeValue).toBe('lima');
	await expect.poll(() => el(LimaNav).getAttribute('aria-selected')).toBe('true');
});

test('arrowing through the pickers shows each slide, and the ends stop', async () => {
	await render(Tabbed);

	el<HTMLButtonElement>(ParisNav).focus();
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(activeValue).toBe('oslo');

	await userEvent.keyboard('{End}');
	await expect.poll(activeValue).toBe('lima');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(activeValue).toBe('lima');

	await userEvent.keyboard('{Home}');
	await expect.poll(activeValue).toBe('paris');
});

// The APG is explicit that the rotation control's label carries the state, and
// that aria-pressed is wrong here because the label already says it.
test('the play trigger flips its label and never claims a pressed state', async () => {
	await render(GalleryAutoplay);

	const play = el<HTMLButtonElement>(PlayTrigger);
	expect(play.getAttribute('aria-label')).toBe('start automatic slide show');
	expect(play.hasAttribute('aria-pressed')).toBe(false);

	await userEvent.click(play);
	await expect.poll(() => el(PlayTrigger).getAttribute('aria-label')).toBe(
		'stop automatic slide show',
	);
	expect(el(PlayTrigger).hasAttribute('aria-pressed')).toBe(false);
});

// Pinned: defect 79 (setInterval-callback graph writes never reach the DOM) - board ledger; un-pin when it lands.
test.fails('autoplay advances the slides and turns the live region off while it runs', async () => {
	await render(GalleryAutoplay);

	await userEvent.click(el(PlayTrigger));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');
	await expect.poll(activeValue, { timeout: 3000 }).toBe('oslo');
});

// The APG requires both: focus anywhere inside stops the rotation, and so does
// the pointer arriving; and neither restarts it, only the rotation control does.
test('focus inside stops the rotation, and it does not restart on its own', async () => {
	await render(GalleryAutoplay);

	await userEvent.click(el(PlayTrigger));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');

	el<HTMLButtonElement>(ForwardTrigger).focus();
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('polite');

	const stopped = activeValue();
	await new Promise((resolve) => setTimeout(resolve, 400));
	expect(activeValue()).toBe(stopped);
});

test('the pointer arriving over the carousel stops the rotation', async () => {
	await render(GalleryAutoplay);

	await userEvent.click(el(PlayTrigger));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');

	await userEvent.hover(el(ParisItem));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('polite');
});

// SSR resume: what the server served has to be usable, and the first gesture
// after resume has to land.
test('SSR resume: the served page shows the named slide and the first click still steps', async () => {
	await renderSSR(Basic);

	expect(el(ParisItem).hasAttribute('ui-active')).toBe(true);
	expect(el(ScrollArea).querySelector('[ui-track]')).not.toBeNull();

	await userEvent.click(el(ForwardTrigger));
	await expect.poll(activeValue).toBe('oslo');
});

test('SSR resume: autoplay declared off has advanced nothing before the page resumed', async () => {
	await renderSSR(GalleryAutoplay);

	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	await new Promise((resolve) => setTimeout(resolve, 300));
	expect(activeValue()).toBe('paris');
});
