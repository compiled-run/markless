import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { beforeEach, expect, test } from 'vitest';
import { installCarouselCss } from './scenarios/carousel-css.ts';
import Basic from './scenarios/basic.tsrx';
import GalleryAutoplay from './scenarios/gallery-autoplay.tsrx';
import Rewind from './scenarios/rewind.tsrx';
import Stepped from './scenarios/stepped.tsrx';
import Tabbed from './scenarios/tabbed.tsrx';
import TwoCarousels from './scenarios/two-carousels.tsrx';
import Untitled from './scenarios/untitled.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import VerticalTabbed from './scenarios/vertical-tabbed.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

// A refusal is only proved by time passing: a gesture crosses the driver, the
// dispatch and the family's demand load before anything it moved can be read.
const QUIET_MS = 800;
const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

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
const Last = page.getByTestId('last');
const Calls = page.getByTestId('calls');
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
		await quiet();
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
		await quiet();
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
	await quiet();
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

// The APG's hover rule is a pause: the pointer leaving the carousel resumes a
// rotation the pointer paused, and only that.
test('the pointer leaving the carousel resumes a rotation it paused', async () => {
	await render(GalleryAutoplay);

	await userEvent.click(el(PlayTrigger));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');
	await userEvent.hover(el(ParisItem));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('polite');
	expect(el(PlayTrigger).getAttribute('aria-label')).toBe('stop automatic slide show');

	const paused = activeValue();
	await new Promise((resolve) => setTimeout(resolve, 250));
	expect(activeValue()).toBe(paused);

	el(Root).dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');
	await expect.poll(activeValue, { timeout: 3000 }).not.toBe(paused);
});

test('the pointer leaving resumes nothing that focus stopped', async () => {
	await render(GalleryAutoplay);

	await userEvent.click(el(PlayTrigger));
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('off');
	el<HTMLButtonElement>(ForwardTrigger).focus();
	await expect.poll(() => el(Root).getAttribute('aria-live')).toBe('polite');

	el(Root).dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
	const stopped = activeValue();
	await new Promise((resolve) => setTimeout(resolve, 400));
	expect(el(Root).getAttribute('aria-live')).toBe('polite');
	expect(activeValue()).toBe(stopped);
});

// A press the family refuses is said so on the control, never swallowed: the
// trigger reports itself unavailable and the root carries the reason.
test('under reduced motion the play trigger says it is refused rather than staying silent', async () => {
	await render(GalleryAutoplay);
	const matchMedia = window.matchMedia;
	window.matchMedia = ((query: string) =>
		({ matches: query.includes('prefers-reduced-motion'), media: query }) as MediaQueryList) as typeof window.matchMedia;
	try {
		await userEvent.click(el(PlayTrigger));
		await expect.poll(() => el(PlayTrigger).getAttribute('aria-disabled')).toBe('true');
		expect(el(PlayTrigger).hasAttribute('ui-reduced-motion')).toBe(true);
		expect(el(Root).hasAttribute('ui-reduced-motion')).toBe(true);
		expect(el(PlayTrigger).getAttribute('aria-label')).toBe('start automatic slide show');
		await new Promise((resolve) => setTimeout(resolve, 300));
		expect(el(Root).getAttribute('aria-live')).toBe('polite');
		expect(activeValue()).toBe('paris');
	} finally {
		window.matchMedia = matchMedia;
	}
});

/** A cancelable keydown, and whether the family's synchronous policy cancelled it. */
function prevented(target: Element, key: string): boolean {
	const keydown = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
	target.dispatchEvent(keydown);
	return keydown.defaultPrevented;
}

for (const mode of MODES) {
	test(`${mode}: a vertical tab list says so and its pickers walk on Up and Down`, async () => {
		if (mode === 'CSR') await render(VerticalTabbed);
		else await renderSSR(VerticalTabbed);

		expect(el(NavList).getAttribute('aria-orientation')).toBe('vertical');
		const top = el<HTMLButtonElement>(page.getByTestId('top-navtrigger'));
		// The off-axis arrows are the page's, decided before the handler loads.
		expect(prevented(top, 'ArrowRight')).toBe(false);
		expect(prevented(top, 'ArrowLeft')).toBe(false);
		await quiet();
		expect(activeValue()).toBe('top');

		top.focus();
		await userEvent.keyboard('{ArrowDown}');
		await expect.poll(activeValue).toBe('middle');
		await expect.poll(() => document.activeElement).toBe(el(page.getByTestId('middle-navtrigger')));
		await userEvent.keyboard('{End}');
		await expect.poll(activeValue).toBe('bottom');
		await userEvent.keyboard('{ArrowUp}');
		await expect.poll(activeValue).toBe('middle');
		await userEvent.keyboard('{Home}');
		await expect.poll(activeValue).toBe('top');
	});

	test(`${mode}: a horizontal tab list leaves Up and Down to the page`, async () => {
		if (mode === 'CSR') await render(Tabbed);
		else await renderSSR(Tabbed);

		expect(el(NavList).getAttribute('aria-orientation')).toBe('horizontal');
		expect(prevented(el(ParisNav), 'ArrowDown')).toBe(false);
		expect(prevented(el(ParisNav), 'ArrowUp')).toBe(false);
		expect(prevented(el(ParisNav), 'ArrowRight')).toBe(true);
	});

	// Stepping two at a time lands on every other slide; the picker that takes
	// focus is the one for the slide showing, not the one at the step's index.
	test(`${mode}: a walk over stepped slides focuses the picker for the slide showing`, async () => {
		if (mode === 'CSR') await render(Stepped);
		else await renderSSR(Stepped);

		el<HTMLButtonElement>(page.getByTestId('one-navtrigger')).focus();
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(activeValue).toBe('three');
		await expect.poll(() => document.activeElement).toBe(el(page.getByTestId('three-navtrigger')));
		await userEvent.keyboard('{ArrowRight}');
		await expect.poll(activeValue).toBe('five');
		await expect.poll(() => document.activeElement).toBe(el(page.getByTestId('five-navtrigger')));
	});
}

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

// ------------------------------------------------------ coming round the ends

test('a rewinding carousel comes round at both ends', async () => {
	await render(Rewind);

	// Back from the first slide reaches the last one, which is what `rewind` buys.
	await userEvent.click(el(BackTrigger));
	await expect.poll(activeValue).toBe('lima');

	await userEvent.click(el(ForwardTrigger));
	await expect.poll(activeValue).toBe('paris');
});

test('a rewinding carousel comes round from its pickers too, and Home and End still jump', async () => {
	await render(Rewind);

	el<HTMLButtonElement>(ParisNav).focus();
	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(activeValue).toBe('lima');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(activeValue).toBe('paris');

	await userEvent.keyboard('{End}');
	await expect.poll(activeValue).toBe('lima');
	await userEvent.keyboard('{Home}');
	await expect.poll(activeValue).toBe('paris');
});

// `rewind` brings the ends round without making the carousel a loop, so the flag
// a consumer styles against still says it is not one.
test('a rewinding carousel does not claim to be a looping one', async () => {
	await render(Rewind);
	expect(el(Root).hasAttribute('ui-loop')).toBe(false);
});

// ------------------------------------------------------- release and the snap

// The mouse is pointer 1 and the platform always holds it; nothing holds this one.
const UNTRACKED_POINTER = 9101;

function pointer(target: Element, type: string, clientX: number, pointerId = 1) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			cancelable: true,
			button: 0,
			buttons: type === 'pointerup' ? 0 : 1,
			clientX,
			clientY: 50,
			pointerType: 'mouse',
			pointerId,
			isPrimary: true,
		}),
	);
}

/** A whole drag on the window: press, travel, release. */
function dragBy(alongX: number, options: { pointerId?: number } = {}) {
	const area = el(ScrollArea);
	const id = options.pointerId ?? 1;
	const box = area.getBoundingClientRect();
	const from = box.left + box.width / 2;
	pointer(area, 'pointerdown', from, id);
	pointer(area, 'pointermove', from + alongX / 2, id);
	pointer(area, 'pointermove', from + alongX, id);
	pointer(area, 'pointerup', from + alongX, id);
}

test('a press with no travel is a tap, and settles on nothing', async () => {
	await render(Basic);

	dragBy(0);
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(activeValue()).toBe('paris');
});

test('a drag shorter than the fling threshold settles back on the slide it started from', async () => {
	await render(Basic);

	dragBy(-4);
	await new Promise((resolve) => setTimeout(resolve, 200));
	expect(activeValue()).toBe('paris');
});

test('a drag run past the last slide settles on it rather than off the end', async () => {
	await render(Basic);

	dragBy(-400);
	await expect.poll(activeValue, { timeout: 2000 }).toBe('lima');
});

test('a press from a pointer the platform is not tracking throws nothing', async () => {
	await render(Basic);

	const failures: string[] = [];
	const record = (event: ErrorEvent) => failures.push(event.message);
	const recordRejection = (event: PromiseRejectionEvent) => failures.push(String(event.reason));
	window.addEventListener('error', record);
	window.addEventListener('unhandledrejection', recordRejection);
	try {
		dragBy(-400, { pointerId: UNTRACKED_POINTER });
		await expect.poll(activeValue, { timeout: 2000 }).toBe('lima');
		expect(failures).toEqual([]);
	} finally {
		window.removeEventListener('error', record);
		window.removeEventListener('unhandledrejection', recordRejection);
	}
});
