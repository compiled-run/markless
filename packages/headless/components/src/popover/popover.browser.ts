import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Rtl from './scenarios/rtl.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import Sided from './scenarios/sided.tsrx';
import Unnamed from './scenarios/unnamed.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';
import WithoutOnChange from './scenarios/without-onchange.tsrx';

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const Title = page.getByTestId('title');
const Description = page.getByTestId('description');
const Copy = page.getByTestId('copy');
const Close = page.getByTestId('close');
const Calls = page.getByTestId('calls');
const Order = page.getByTestId('order');
const EndTrigger = page.getByTestId('end-trigger');
const EndContent = page.getByTestId('end-content');
const TopTrigger = page.getByTestId('top-trigger');
const TopContent = page.getByTestId('top-content');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstContent = page.getByTestId('first-content');
const FirstClose = page.getByTestId('first-close');
const FirstValue = page.getByTestId('first-value');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondContent = page.getByTestId('second-content');
const SecondValue = page.getByTestId('second-value');
const StartTrigger = page.getByTestId('start-trigger');
const StartContent = page.getByTestId('start-content');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// Where a placement may land and still be the placement the family asked for.
const SLACK = 1.5;

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a surface enlisted leaves the next row's dismissals going to it.
afterEach(async () => {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

function press(target: HTMLElement, button = 0) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, button }));
}

function expectClosed(trigger: Element, content: Element) {
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	expect(content.hasAttribute('hidden')).toBe(true);
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(content.hasAttribute('ui-open')).toBe(false);
	expect(document.contains(content)).toBe(true);
}

function expectShowing(trigger: Element, content: Element) {
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
	expect(content.hasAttribute('hidden')).toBe(false);
	expect(content.getAttribute('ui-open')).toBe('');
	expect(content.hasAttribute('ui-closed')).toBe(false);
}

async function openBasic() {
	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
}

// The placement is a CSS anchor, so the surface is in place on the layout that
// shows it - there is nothing to wait for beyond reading a box.
function expectAnchored(content: Element) {
	const style = (content as HTMLElement).style;
	expect(style.position).toBe('absolute');
	expect(style.getPropertyValue('position-anchor')).toBe('--ui-popover');
	expect(style.getPropertyValue('position-area')).not.toBe('');
}

function expectBasicRendered() {
	expectClosed(el(Trigger), el(Content));
	expect(el(Trigger).getAttribute('type')).toBe('button');
	expect(el(Trigger).getAttribute('aria-haspopup')).toBe('dialog');
	expect(el(Content).getAttribute('role')).toBe('dialog');
	expect(el(Content).getAttribute('ui-side')).toBe('bottom');
	expect(el(Root).getAttribute('ui-closed')).toBe('');
	expect(el(Root).hasAttribute('ui-open')).toBe(false);
	expect(el(Content).textContent).toContain('Anyone with the link');
}

function expectNamingWired() {
	expect(el(Content).id).toBeTruthy();
	expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
	expect(el(Title).id).toBeTruthy();
	expect(el(Content).getAttribute('aria-labelledby')).toBe(el(Title).id);
	expect(el(Description).id).toBeTruthy();
	expect(el(Content).getAttribute('aria-describedby')).toBe(el(Description).id);
}

// A popover is not a dialog a person has to answer: nothing takes the page out of
// reach, and nothing moves focus off what the person was on.
function expectNotModal() {
	expect(el(Content).hasAttribute('aria-modal')).toBe(false);
	expect(el(Background).hasAttribute('inert')).toBe(false);
	expect(el(Background).hasAttribute('aria-hidden')).toBe(false);
	expect(document.body.style.overflow).toBe('');
}

function expectRootDropsDestructuredProps() {
	expect(el(Root).hasAttribute('open')).toBe(false);
	expect(el(Root).hasAttribute('side')).toBe(false);
	expect(el(Root).hasAttribute('ui-closed')).toBe(true);
}

for (const mode of MODES) {
	test(`${mode}: the starter renders a closed surface wired to its trigger`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectBasicRendered();
		expectNamingWired();
	});

	test(`${mode}: a root drops the open and side props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);
		expectRootDropsDestructuredProps();
	});

	test(`${mode}: a surface with no title or description omits its naming references`, async () => {
		if (mode === 'CSR') await render(Unnamed);
		else await renderSSR(Unnamed);

		// Unbound IDREFs are omitted, never emitted dangling.
		const content = el<HTMLElement>(Content);
		expect(content.getAttribute('role')).toBe('dialog');
		expect(content.hasAttribute('aria-labelledby')).toBe(false);
		expect(content.hasAttribute('aria-describedby')).toBe(false);
		expect(el(Trigger).getAttribute('aria-controls')).toBe(content.id);
	});

	test(`${mode}: the trigger opens the surface and closes it again`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		await openBasic();
		expectShowing(el(Trigger), el(Content));
		expect(el(Root).getAttribute('ui-open')).toBe('');
		expectNotModal();

		el(Close).click();
		await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
		expectClosed(el(Trigger), el(Content));
	});

	test(`${mode}: two co-rendered popovers mint distinct ids and open on their own`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);

		expect(el(FirstContent).id).not.toBe(el(SecondContent).id);
		expect(el(FirstTrigger).getAttribute('aria-controls')).toBe(el(FirstContent).id);
		expect(el(SecondTrigger).getAttribute('aria-controls')).toBe(el(SecondContent).id);

		el(FirstTrigger).click();
		await expect.poll(() => el(FirstContent).hasAttribute('hidden')).toBe(false);
		expect(el(SecondContent).hasAttribute('hidden')).toBe(true);
	});
}

test('CSR: the surface is placed under the trigger it belongs to', async () => {
	await render(Basic);
	await openBasic();

	expectAnchored(el(Content));
	const surface = el(Content).getBoundingClientRect();
	const anchor = el(Trigger).getBoundingClientRect();
	expect(Math.abs(surface.top - anchor.bottom)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(surface.left - anchor.left)).toBeLessThanOrEqual(SLACK);
});

// Two popovers on one page each carry the same anchor name, so this is also the
// row that would catch a surface finding the other popover's trigger.
test('CSR: side places the surface beside or above the trigger, and says which on the surface', async () => {
	await render(Sided);
	expect(el(EndContent).getAttribute('ui-side')).toBe('end');
	expect(el(TopContent).getAttribute('ui-side')).toBe('top');

	el(EndTrigger).click();
	await expect.poll(() => el(EndContent).hasAttribute('hidden')).toBe(false);
	const beside = el(EndContent).getBoundingClientRect();
	const endAnchor = el(EndTrigger).getBoundingClientRect();
	expect(Math.abs(beside.left - endAnchor.right)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(beside.top - endAnchor.top)).toBeLessThanOrEqual(SLACK);

	el(TopTrigger).click();
	await expect.poll(() => el(TopContent).hasAttribute('hidden')).toBe(false);
	const above = el(TopContent).getBoundingClientRect();
	const topAnchor = el(TopTrigger).getBoundingClientRect();
	expect(Math.abs(above.bottom - topAnchor.top)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(above.left - topAnchor.left)).toBeLessThanOrEqual(SLACK);
});

// `start` and `end` are the writing direction's sides, and only a right-to-left
// page tells them apart from left and right.
test('CSR: start and end follow the writing direction', async () => {
	await render(Rtl);

	const startSurface = el(StartContent).getBoundingClientRect();
	const startAnchor = el(StartTrigger).getBoundingClientRect();
	expect(Math.abs(startSurface.left - startAnchor.right)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(startSurface.top - startAnchor.top)).toBeLessThanOrEqual(SLACK);

	const endSurface = el(EndContent).getBoundingClientRect();
	const endAnchor = el(EndTrigger).getBoundingClientRect();
	expect(Math.abs(endSurface.right - endAnchor.left)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(endSurface.top - endAnchor.top)).toBeLessThanOrEqual(SLACK);
});

test('CSR: Escape closes the surface and hands focus back to the trigger', async () => {
	await render(Basic);
	await openBasic();
	el(Close).focus();
	expect(document.activeElement).toBe(el(Close));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});

// Nothing about a popover demands an answer, so a person who has moved on keeps
// where they are.
test('CSR: Escape with the focus elsewhere closes the surface and leaves focus alone', async () => {
	await render(Basic);
	await openBasic();
	el(Background).focus();

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(document.activeElement).toBe(el(Background));
});

test('CSR: a press outside the surface closes it', async () => {
	await render(Basic);
	await openBasic();

	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expectClosed(el(Trigger), el(Content));
});

test('CSR: a press inside the surface never closes it', async () => {
	await render(Basic);
	await openBasic();

	press(el<HTMLElement>(Copy));
	await new Promise((resolve) => setTimeout(resolve, 100));
	expectShowing(el(Trigger), el(Content));
});

// The press on an open popover's own trigger is an outside press, so it closes the
// surface before the click behind it arrives; without the family's grace that click
// re-opens what the press just shut.
test('CSR: pressing the trigger of an open popover closes it and leaves it closed', async () => {
	await render(Basic);
	await openBasic();

	press(el<HTMLElement>(Trigger));
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await new Promise((resolve) => setTimeout(resolve, 100));
	expectClosed(el(Trigger), el(Content));
});

test('CSR: the close part closes the surface and hands focus back to the trigger', async () => {
	await render(Basic);
	await openBasic();
	el(Close).focus();

	el(Close).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});

test('CSR: opening a second popover closes the first', async () => {
	await render(WithOnChange);

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstContent).hasAttribute('hidden')).toBe(false);

	press(el<HTMLElement>(SecondTrigger));
	await expect.poll(() => el(SecondContent).hasAttribute('hidden')).toBe(false);
	expect(el(FirstContent).hasAttribute('hidden')).toBe(true);
	expect(el(FirstValue).textContent).toBe('false');
	expect(el(SecondValue).textContent).toBe('true');
});

test('CSR: a click calls the consumer onChange once with the next value', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');
	expect(el(Order).textContent).toBe('');

	el(FirstTrigger).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('true');
	await expect.poll(() => el(Calls).textContent).toBe('1');
	// The consumer's own click handler on the trigger runs after the popover has
	// opened and after onChange has already been called.
	await expect.poll(() => el(Order).textContent).toBe('change-click');
	expect(el(SecondValue).textContent).toBe('');

	el(FirstClose).click();
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: Escape reports the close to the consumer once', async () => {
	await render(WithOnChange);
	el(FirstTrigger).click();
	await expect.poll(() => el(FirstContent).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(FirstValue).textContent).toBe('false');
	await expect.poll(() => el(Calls).textContent).toBe('2');
});

test('CSR: an omitted onChange opens the surface anyway', async () => {
	await render(WithoutOnChange);

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	expect(el(Calls).textContent).toBe('0');
	expect(el(Trigger).getAttribute('aria-expanded')).toBe('true');
});

test('SSR: the served surface is hidden, and the first click after resume shows it', async () => {
	await renderSSR(Basic);
	expectClosed(el(Trigger), el(Content));
	expect(el(Content).textContent).toContain('Anyone with the link');

	el(Trigger).click();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	await expect.poll(() => el(Trigger).getAttribute('aria-expanded')).toBe('true');
});

// The old placement measured two boxes from the opening click, so a surface that
// arrived already showing was never placed. A CSS anchor needs no gesture.
test('SSR: a popover served open is placed against its trigger with no interaction', async () => {
	await renderSSR(ServedOpen);
	expectShowing(el(Trigger), el(Content));

	expectAnchored(el(Content));
	const surface = el(Content).getBoundingClientRect();
	const anchor = el(Trigger).getBoundingClientRect();
	expect(surface.width).toBeGreaterThan(0);
	expect(Math.abs(surface.top - anchor.bottom)).toBeLessThanOrEqual(SLACK);
	expect(Math.abs(surface.left - anchor.left)).toBeLessThanOrEqual(SLACK);
});

test('SSR: a popover served open is showing, and Escape closes it', async () => {
	await renderSSR(ServedOpen);
	expectShowing(el(Trigger), el(Content));
	expectNotModal();

	el(Close).focus();
	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => document.activeElement).toBe(el(Trigger));
});
