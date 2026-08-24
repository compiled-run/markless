import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { beforeEach, expect, test } from 'vitest';
import { installCarouselCss } from './scenarios/carousel-css.ts';
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

// A carousel is layout before it is behaviour: the viewport has to clip, the
// track has to lay the slides out along the axis, and the slides have to have a
// size. Without it every row here ran against a bare stack of divs, which is
// what hid the failure: an auto-height vertical viewport measures its own
// content, so every slide reads as visible.
beforeEach(() => {
	installCarouselCss();
});

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

	// The trigger's handler always ran; the navigation math
	// killed it. `slidesPerView` measured the viewport's size along the axis on
	// every step, and a vertical carousel's viewport is auto-height unless the
	// consumer constrains it, so the measurement reported all three slides
	// visible, `reachableValues` left one reachable slide, and stepping had
	// nowhere to go. The measurement is now asked for only by a `move="view"`
	// carousel, which is where a viewport's worth is the unit of movement.
	test(`${mode}: a vertical carousel says so and still steps`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);

		expect(el(Root).hasAttribute('ui-vertical')).toBe(true);
		expect(el(TopItem).hasAttribute('ui-active')).toBe(true);

		// The slides really do run down rather than across, and the viewport
		// really does clip. Asserted rather than assumed: a vertical carousel laid
		// out as a plain stack is the shape that hid this defect.
		const viewport = el(ScrollArea);
		expect(viewport.clientHeight).toBeLessThan(viewport.scrollHeight);
		expect(el(MiddleItem).offsetTop).toBeGreaterThan(el(TopItem).offsetTop);
		expect(el(MiddleItem).offsetLeft).toBe(el(TopItem).offsetLeft);

		await userEvent.click(el(ForwardTrigger));
		await expect.poll(() => el(MiddleItem).hasAttribute('ui-active')).toBe(true);
	});

	// The trigger's handler is a BOUND symbol - it forwards the
	// consumer's onClick - so it dispatched at the page's own edge path (`c4:`)
	// while the two rendered carousels are rooted at `c0:` and `c5:`. Its graph
	// reads were already spelled against the widget root by the bound edge's
	// instance path; only the element() handle read still carried the module-level
	// id, which both carousels had filed, so the registry refused it outright. The
	// handle read now takes that same bound instance path, and `carousel.root`
	// binding no handle of its own no longer matters.
	test(`${mode}: a trigger in one carousel leaves the other alone`, async () => {
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

test('autoplay advances the slides and turns the live region off while it runs', async () => {
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
