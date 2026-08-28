import { cleanup, render, renderSSR } from '@markless/vitest-browser';
import axe from 'axe-core';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import {
	isResizeKey,
	keyTarget,
	percentDelta,
	resizedSizes,
	separatorAxis,
	valueText,
} from './resizable-math.ts';
import Basic from './scenarios/basic.tsrx';
import Collapsible from './scenarios/collapsible.tsrx';
import Controlled from './scenarios/controlled.tsrx';
import Disabled from './scenarios/disabled.tsrx';
import Nested from './scenarios/nested.tsrx';
import Rtl from './scenarios/rtl.tsrx';
import Three from './scenarios/three.tsrx';
import TwoGroups from './scenarios/two-groups.tsrx';
import Vertical from './scenarios/vertical.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Root = page.getByTestId('root');
const Nav = page.getByTestId('nav');
const Main = page.getByTestId('main');
const Thumb = page.getByTestId('thumb');
const Left = page.getByTestId('left');
const Middle = page.getByTestId('middle');
const Right = page.getByTestId('right');
const FirstThumb = page.getByTestId('first-thumb');
const SecondThumb = page.getByTestId('second-thumb');
const Sidebar = page.getByTestId('sidebar');
const Editor = page.getByTestId('editor');
const Preview = page.getByTestId('preview');
const Console = page.getByTestId('console');
const Body = page.getByTestId('body');
const Top = page.getByTestId('top');
const Bottom = page.getByTestId('bottom');
const OuterThumb = page.getByTestId('outer-thumb');
const InnerThumb = page.getByTestId('inner-thumb');
const FirstNav = page.getByTestId('first-nav');
const SecondNav = page.getByTestId('second-nav');
const Changed = page.getByTestId('changed');
const Settled = page.getByTestId('settled');
const Last = page.getByTestId('last');
const SettledAt = page.getByTestId('settled-at');
const Calls = page.getByTestId('calls');
const Reset = page.getByTestId('reset');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;
const AXE_TAGS = ['wcag2a', 'wcag21a'] as const;

// The mouse is pointer 1 and the platform always holds it; nothing holds this one.
const UNTRACKED_POINTER = 9101;

afterEach(async () => {
	await cleanup();
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function customProperty(target: Element, name: string) {
	return window.getComputedStyle(target).getPropertyValue(name).trim();
}

function pointer(target: Element, type: string, clientX: number, clientY: number, pointerId = 1) {
	target.dispatchEvent(
		new PointerEvent(type, {
			bubbles: true,
			button: 0,
			buttons: 1,
			clientX,
			clientY,
			pointerId,
			isPrimary: true,
		}),
	);
}

/** The middle of a divider, which is where a person grabs it. */
function centreOf(target: Element) {
	const box = target.getBoundingClientRect();
	return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function dragBy(target: Element, alongX: number, alongY: number, pointerId = 1) {
	const at = centreOf(target);
	pointer(target, 'pointerdown', at.x, at.y, pointerId);
	pointer(target, 'pointermove', at.x + alongX, at.y + alongY, pointerId);
	pointer(target, 'pointerup', at.x + alongX, at.y + alongY, pointerId);
}

async function expectNoAxeViolations(container: Element, phase: string) {
	const results = await axe.run(container as HTMLElement, {
		runOnly: { type: 'tag', values: [...AXE_TAGS] },
		resultTypes: ['violations'],
	});
	const reported = results.violations.map((violation) => {
		const nodes = violation.nodes.map((node) => `      ${node.html}`).join('\n');
		return `  ${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}\n${nodes}`;
	});
	expect(reported, `axe violations while ${phase}`).toEqual([]);
}

function scopeOf(result: { container: unknown }): Element {
	const container = result.container;
	if (!(container instanceof Element)) throw new Error('The mount handed back no DOM container.');
	return container;
}

function expectBasicRendered() {
	const divider = el(Thumb);
	expect(divider.getAttribute('role')).toBe('separator');
	expect(divider.getAttribute('tabindex')).toBe('0');
	// A side-by-side group is parted by a vertical splitter: APG's Left and Right arrows move it.
	expect(divider.getAttribute('aria-orientation')).toBe('vertical');
	expect(divider.getAttribute('aria-valuemin')).toBe('10');
	expect(divider.getAttribute('aria-valuemax')).toBe('80');
	expect(divider.getAttribute('aria-valuenow')).toBe('30');
	expect(divider.getAttribute('aria-valuetext')).toBe('30%');
	expect(divider.getAttribute('aria-disabled')).toBe('false');
	expect(divider.getAttribute('aria-label')).toBe('Resize navigation');

	// The panel's name is minted as its id, which is what aria-controls points at.
	expect(el(Nav).id).toBe('nav');
	expect(divider.getAttribute('aria-controls')).toBe('nav');
}

function expectBasicDataSurface() {
	const root = el(Root);
	expect(root.getAttribute('ui-orientation')).toBe('horizontal');
	expect(root.hasAttribute('ui-panels')).toBe(true);
	expect(root.hasAttribute('ui-disabled')).toBe(false);
	expect(root.hasAttribute('ui-dragging')).toBe(false);

	expect(el(Nav).getAttribute('ui-value')).toBe('nav');
	expect(el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Main).getAttribute('ui-size')).toBe('70');
	expect(el(Nav).hasAttribute('ui-collapsed')).toBe(false);
	expect(customProperty(el(Nav), '--size')).toBe('30');
	expect(customProperty(el(Main), '--size')).toBe('70');

	const divider = el(Thumb);
	expect(divider.getAttribute('ui-value')).toBe('nav');
	expect(divider.getAttribute('ui-min')).toBe('10');
	expect(divider.getAttribute('ui-max')).toBe('80');
	expect(divider.hasAttribute('ui-dragging')).toBe(false);
	expect(divider.hasAttribute('ui-collapsible')).toBe(false);
}

function expectRootDropsDestructuredProps() {
	const root = el(Root);
	expect(root.hasAttribute('sizes')).toBe(false);
	expect(root.hasAttribute('defaultSizes')).toBe(false);
	expect(root.hasAttribute('orientation')).toBe(false);
	expect(root.hasAttribute('step')).toBe(false);
	// Dropping too much has to show up as red here rather than pass by deleting everything.
	expect(root.getAttribute('ui-orientation')).toBe('horizontal');
	expect(el(Thumb).getAttribute('aria-valuenow')).toBe('30');
}

/** The panels lay out at the share they were given, which is what `--size` buys. */
function expectLaidOutInProportion() {
	const nav = el(Nav).getBoundingClientRect().width;
	const main = el(Main).getBoundingClientRect().width;
	expect(Math.round((nav / (nav + main)) * 100)).toBe(30);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a splitter over two named panels`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
	});

	test(`${mode}: the starter publishes its sizes and state as data`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicDataSurface();
	});

	test(`${mode}: the root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: the panels are laid out at the sizes they were served with`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectLaidOutInProportion();
	});

	test(`${mode}: a stacked group parts its panels with a horizontal splitter`, async () => {
		if (mode === 'CSR') await render(Vertical);
		else await renderSSR(Vertical);

		expect(el(Root).getAttribute('ui-orientation')).toBe('vertical');
		expect(el(Thumb).getAttribute('aria-orientation')).toBe('horizontal');
		expect(el(Thumb).getAttribute('ui-orientation')).toBe('vertical');
		expect(el(Preview).getAttribute('ui-size')).toBe('60');
		expect(el(Console).getAttribute('ui-size')).toBe('40');
	});

	test(`${mode}: a nested group is one panel hosting the same parts`, async () => {
		if (mode === 'CSR') await render(Nested);
		else await renderSSR(Nested);

		const body = el(Body);
		expect(body.getAttribute('ui-orientation')).toBe('vertical');
		expect(body.contains(el(Top))).toBe(true);
		expect(body.contains(el(InnerThumb))).toBe(true);
		// No second root: the inner group is a panel, and one record covers both levels.
		expect(el(Root).querySelectorAll('[ui-panels]').length).toBe(0);
		expect(el(OuterThumb).getAttribute('aria-orientation')).toBe('vertical');
		expect(el(InnerThumb).getAttribute('aria-orientation')).toBe('horizontal');
		expect(el(Top).getAttribute('ui-size')).toBe('60');
		expect(el(Bottom).getAttribute('ui-size')).toBe('40');
	});

	test(`${mode}: a collapsible divider says so and starts open`, async () => {
		if (mode === 'CSR') await render(Collapsible);
		else await renderSSR(Collapsible);

		expect(el(Thumb).hasAttribute('ui-collapsible')).toBe(true);
		expect(el(Thumb).hasAttribute('ui-collapsed')).toBe(false);
		expect(el(Sidebar).hasAttribute('ui-collapsed')).toBe(false);
		expect(el(Sidebar).getAttribute('ui-size')).toBe('30');
	});

	test(`${mode}: a widget nobody may resize is out of the tab order`, async () => {
		if (mode === 'CSR') await render(Disabled);
		else await renderSSR(Disabled);

		expect(el(Thumb).getAttribute('tabindex')).toBe('-1');
		expect(el(Thumb).getAttribute('aria-disabled')).toBe('true');
		expect(el(Root).hasAttribute('ui-disabled')).toBe(true);
		expect(el(Thumb).hasAttribute('ui-disabled')).toBe(true);
	});

	test(`${mode}: two widgets on a page report their own sizes`, async () => {
		if (mode === 'CSR') await render(TwoGroups);
		else await renderSSR(TwoGroups);

		expect(el(FirstNav).getAttribute('ui-size')).toBe('30');
		expect(el(SecondNav).getAttribute('ui-size')).toBe('50');
		expect(el(FirstThumb).getAttribute('aria-valuenow')).toBe('30');
		expect(el(SecondThumb).getAttribute('aria-valuenow')).toBe('50');
	});
}

// ------------------------------------------------------------------- keyboard

test('SSR: the first keystroke after a resume steps from the rendered size', async () => {
	await renderSSR(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('31');
	expect(el(Nav).getAttribute('ui-size')).toBe('31');
	expect(el(Main).getAttribute('ui-size')).toBe('69');
});

test('CSR: an arrow moves the divider by one step in either direction', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('31');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('30');

	// The arrows of the other axis are not this divider's keys.
	await userEvent.keyboard('{ArrowUp}');
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('30');
});

test('CSR: a shifted arrow moves by ten steps', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('40');
	expect(el(Main).getAttribute('ui-size')).toBe('60');
});

test('CSR: Home and End reach the limits the divider declares', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{End}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('80');
	expect(el(Main).getAttribute('ui-size')).toBe('20');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('80');

	await userEvent.keyboard('{Home}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('10');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('10');
});

test('CSR: a stacked group is moved by the up and down arrows', async () => {
	await render(Vertical);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('61');

	await userEvent.keyboard('{ArrowUp}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('60');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('60');
});

test('CSR: right-to-left text grows the panel the arrow points at', async () => {
	await render(Rtl);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('29');

	await userEvent.keyboard('{ArrowLeft}');
	await expect.poll(() => el(Thumb).getAttribute('aria-valuenow')).toBe('30');
});

test('CSR: each divider of a three-panel group moves its own pair', async () => {
	await render(Three);

	el<HTMLElement>(FirstThumb).focus();
	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(Left).getAttribute('ui-size')).toBe('35');
	expect(el(Middle).getAttribute('ui-size')).toBe('40');
	expect(el(Right).getAttribute('ui-size')).toBe('25');

	el<HTMLElement>(SecondThumb).focus();
	await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}');
	await expect.poll(() => el(Middle).getAttribute('ui-size')).toBe('30');
	expect(el(Right).getAttribute('ui-size')).toBe('35');
	expect(el(Left).getAttribute('ui-size')).toBe('35');
});

test('CSR: a nested divider moves its own group and nothing above it', async () => {
	await render(Nested);

	el<HTMLElement>(InnerThumb).focus();
	await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
	await expect.poll(() => el(Top).getAttribute('ui-size')).toBe('70');
	expect(el(Bottom).getAttribute('ui-size')).toBe('30');
	expect(el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Body).getAttribute('ui-size')).toBe('70');

	el<HTMLElement>(OuterThumb).focus();
	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('40');
	expect(el(Body).getAttribute('ui-size')).toBe('60');
	expect(el(Top).getAttribute('ui-size')).toBe('70');
});

test('CSR: Enter collapses the primary panel and restores what it had', async () => {
	await render(Collapsible);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
	await expect.poll(() => el(Sidebar).getAttribute('ui-size')).toBe('40');

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Sidebar).getAttribute('ui-size')).toBe('5');
	expect(el(Sidebar).hasAttribute('ui-collapsed')).toBe(true);
	expect(el(Thumb).hasAttribute('ui-collapsed')).toBe(true);
	expect(el(Editor).getAttribute('ui-size')).toBe('95');

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Sidebar).getAttribute('ui-size')).toBe('40');
	expect(el(Sidebar).hasAttribute('ui-collapsed')).toBe(false);
	expect(el(Editor).getAttribute('ui-size')).toBe('60');
});

test('CSR: Enter on a divider that does not collapse leaves the sizes alone', async () => {
	await render(Basic);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Nav).hasAttribute('ui-collapsed')).toBe(false);
});

test('CSR: a keystroke both changes the sizes and settles them', async () => {
	await render(WithOnChange);
	el<HTMLElement>(Thumb).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Changed).textContent).toBe('1');
	expect(el(Settled).textContent).toBe('1');
	expect(el(Last).textContent).toBe('31');
	expect(el(SettledAt).textContent).toBe('31');

	// A key that cannot move the divider reports nothing at all.
	await userEvent.keyboard('{End}');
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Changed).textContent).toBe('2');
	expect(el(Settled).textContent).toBe('2');
});

// -------------------------------------------------------------------- pointer

// A share is a share of what the panels span, not of the group's box, so the
// boundary follows the pointer exactly however wide the divider is drawn.
test('CSR: a drag moves the boundary as far as the pointer went', async () => {
	await render(WithOnChange);
	const divider = el(Thumb);
	const before = el(Nav).getBoundingClientRect().width;
	const at = centreOf(divider);

	pointer(divider, 'pointerdown', at.x, at.y);
	pointer(divider, 'pointermove', at.x + 40, at.y);
	pointer(divider, 'pointermove', at.x + 80, at.y);
	pointer(divider, 'pointerup', at.x + 80, at.y);

	await expect.poll(() => Number(el(Nav).getAttribute('ui-size'))).toBeGreaterThan(30);
	expect(el(Nav).getBoundingClientRect().width).toBeCloseTo(before + 80, 0);
	const nav = Number(el(Nav).getAttribute('ui-size'));
	const main = Number(el(Main).getAttribute('ui-size'));
	expect(nav + main).toBeCloseTo(100, 2);
	expect(el(Settled).textContent).toBe('1');
	expect(Number(el(Changed).textContent)).toBeGreaterThan(1);
	expect(el(SettledAt).textContent).toBe(String(nav));
});

test('CSR: a divider in flight says so, and stops saying so on release', async () => {
	await render(Basic);
	const divider = el(Thumb);
	const at = centreOf(divider);

	pointer(divider, 'pointerdown', at.x, at.y);
	pointer(divider, 'pointermove', at.x + 20, at.y);
	await expect.poll(() => divider.hasAttribute('ui-dragging')).toBe(true);
	expect(el(Root).hasAttribute('ui-dragging')).toBe(true);

	pointer(divider, 'pointerup', at.x + 20, at.y);
	await expect.poll(() => divider.hasAttribute('ui-dragging')).toBe(false);
	expect(el(Root).hasAttribute('ui-dragging')).toBe(false);
});

test('CSR: a drag stops at the limits the divider declares', async () => {
	await render(Basic);

	dragBy(el(Thumb), 400, 0);
	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('80');
	expect(el(Main).getAttribute('ui-size')).toBe('20');

	dragBy(el(Thumb), -400, 0);
	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('10');
	expect(el(Main).getAttribute('ui-size')).toBe('90');
});

test('CSR: a stacked group drags along its own axis', async () => {
	await render(Vertical);
	const before = el(Preview).getBoundingClientRect().height;

	dragBy(el(Thumb), 0, 30);
	await expect.poll(() => Number(el(Preview).getAttribute('ui-size'))).toBeGreaterThan(60);
	expect(el(Preview).getBoundingClientRect().height).toBeCloseTo(before + 30, 0);
	// Travel across the axis is not this divider's business.
	const grown = el(Preview).getAttribute('ui-size');
	dragBy(el(Thumb), 40, 0);
	await expect.poll(() => el(Preview).getAttribute('ui-size')).toBe(grown);
});

test('CSR: right-to-left text grows the panel the pointer moves toward', async () => {
	await render(Rtl);
	const before = el(Nav).getBoundingClientRect().width;

	dragBy(el(Thumb), -40, 0);
	await expect.poll(() => Number(el(Nav).getAttribute('ui-size'))).toBeGreaterThan(30);
	expect(el(Nav).getBoundingClientRect().width).toBeCloseTo(before + 40, 0);
});

test('CSR: a nested drag stays inside its own group', async () => {
	await render(Nested);
	const before = el(Top).getBoundingClientRect().height;

	dragBy(el(InnerThumb), 0, 20);
	await expect.poll(() => Number(el(Top).getAttribute('ui-size'))).toBeGreaterThan(60);
	expect(el(Top).getBoundingClientRect().height).toBeCloseTo(before + 20, 0);
	expect(el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Body).getAttribute('ui-size')).toBe('70');
});

test('CSR: a drag in one widget leaves the other alone', async () => {
	await render(TwoGroups);

	dragBy(el(FirstThumb), 40, 0);
	await expect.poll(() => Number(el(FirstNav).getAttribute('ui-size'))).toBeGreaterThan(30);
	expect(el(SecondNav).getAttribute('ui-size')).toBe('50');
});

// A press can reach the family with its pointer already lifted - the runtime
// replays a recorded press once its handler has loaded - and capturing a pointer
// the platform is no longer tracking throws.
test('CSR: a press from a pointer the platform is not tracking throws nothing', async () => {
	await render(Basic);

	const failures: string[] = [];
	const record = (event: ErrorEvent) => failures.push(event.message);
	const recordRejection = (event: PromiseRejectionEvent) => failures.push(String(event.reason));
	window.addEventListener('error', record);
	window.addEventListener('unhandledrejection', recordRejection);
	try {
		dragBy(el(Thumb), 40, 0, UNTRACKED_POINTER);
		await expect.poll(() => Number(el(Nav).getAttribute('ui-size'))).toBeGreaterThan(30);
		expect(failures).toEqual([]);

		// And the next ordinary gesture still moves the boundary.
		const after = Number(el(Nav).getAttribute('ui-size'));
		dragBy(el(Thumb), 40, 0);
		await expect.poll(() => Number(el(Nav).getAttribute('ui-size'))).toBeGreaterThan(after);
		expect(failures).toEqual([]);
	} finally {
		window.removeEventListener('error', record);
		window.removeEventListener('unhandledrejection', recordRejection);
	}
});

test('CSR: a widget nobody may resize ignores the pointer and the keyboard', async () => {
	await render(Disabled);

	dragBy(el(Thumb), 60, 0);
	el<HTMLElement>(Thumb).focus();
	await userEvent.keyboard('{ArrowRight}');
	await userEvent.keyboard('{End}');
	await userEvent.keyboard('{Enter}');

	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Calls).textContent).toBe('0');
	expect(el(Root).hasAttribute('ui-dragging')).toBe(false);
});

// ------------------------------------------------------------------ controlled

test('CSR: a controlled widget moves only when the record comes back in', async () => {
	await render(Controlled);

	dragBy(el(Thumb), 40, 0);
	await expect.poll(() => Number(el(Nav).getAttribute('ui-size'))).toBeGreaterThan(30);
	expect(Number(el(Calls).textContent)).toBeGreaterThan(0);

	el<HTMLButtonElement>(Reset).click();
	await expect.poll(() => el(Nav).getAttribute('ui-size')).toBe('30');
	expect(el(Main).getAttribute('ui-size')).toBe('70');
});

// ----------------------------------------------------------------------- math

test('the size math is decided in one place, without a DOM', () => {
	const sizes = { nav: 30, main: 70 };

	expect(resizedSizes(sizes, 'nav', 'main', 45, 10, 80)).toEqual({ nav: 45, main: 55 });
	// The pair is all there is to give: the primary cannot take from a third panel.
	expect(resizedSizes(sizes, 'nav', 'main', 120, 10, 100)).toEqual({ nav: 100, main: 0 });
	expect(resizedSizes(sizes, 'nav', 'main', 5, 10, 80)).toEqual({ nav: 10, main: 90 });
	// A divider with nothing behind it moves nothing else.
	expect(resizedSizes(sizes, 'main', undefined, 40, 0, 100)).toEqual({ nav: 30, main: 40 });

	expect(percentDelta(80, 400)).toBe(20);
	expect(percentDelta(80, 0)).toBe(0);

	expect(separatorAxis('horizontal')).toBe('vertical');
	expect(separatorAxis('vertical')).toBe('horizontal');

	expect(keyTarget('ArrowRight', false, 30, 10, 80, 1, 'horizontal', false)).toBe(31);
	expect(keyTarget('ArrowRight', true, 30, 10, 80, 1, 'horizontal', false)).toBe(40);
	expect(keyTarget('ArrowRight', false, 30, 10, 80, 1, 'horizontal', true)).toBe(29);
	expect(keyTarget('ArrowDown', false, 30, 10, 80, 1, 'vertical', false)).toBe(31);
	expect(keyTarget('ArrowDown', false, 30, 10, 80, 1, 'horizontal', false)).toBe(null);
	expect(keyTarget('Home', false, 30, 10, 80, 1, 'horizontal', false)).toBe(10);
	expect(keyTarget('End', false, 30, 10, 80, 1, 'horizontal', false)).toBe(80);
	expect(keyTarget('Tab', false, 30, 10, 80, 1, 'horizontal', false)).toBe(null);

	expect(isResizeKey('ArrowLeft', 'horizontal')).toBe(true);
	expect(isResizeKey('ArrowLeft', 'vertical')).toBe(false);
	expect(valueText(30)).toBe('30%');
	expect(valueText(undefined)).toBe(undefined);
});

// ------------------------------------------------------------------------ axe

for (const mode of MODES) {
	test(`axe finds nothing on the starter in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Basic) : await renderSSR(Basic);
		await expectNoAxeViolations(scopeOf(mounted), `the starter is at rest in ${mode}`);
	});

	test(`axe finds nothing on a three-panel group in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Three) : await renderSSR(Three);
		await expectNoAxeViolations(scopeOf(mounted), `three panels are at rest in ${mode}`);
	});

	test(`axe finds nothing on a nested group in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Nested) : await renderSSR(Nested);
		await expectNoAxeViolations(scopeOf(mounted), `a nested group is at rest in ${mode}`);
	});

	test(`axe finds nothing on a stacked group in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Vertical) : await renderSSR(Vertical);
		await expectNoAxeViolations(scopeOf(mounted), `a stacked group is at rest in ${mode}`);
	});

	test(`axe finds nothing on a widget nobody may resize in ${mode}`, async () => {
		const mounted = mode === 'CSR' ? await render(Disabled) : await renderSSR(Disabled);
		await expectNoAxeViolations(scopeOf(mounted), `the disabled widget is at rest in ${mode}`);
	});
}

test('axe finds nothing once a panel is collapsed', async () => {
	const mounted = await render(Collapsible);
	el<HTMLElement>(Thumb).focus();
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(Sidebar).getAttribute('ui-size')).toBe('5');

	await expectNoAxeViolations(scopeOf(mounted), 'the sidebar is collapsed');
});
