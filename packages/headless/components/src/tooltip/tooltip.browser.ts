import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import IconButton from './scenarios/icon-button.tsrx';
import InsidePopover from './scenarios/inside-popover.tsrx';
import Reversed from './scenarios/reversed.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import Toolbar from './scenarios/toolbar.tsrx';
import TwoTooltips from './scenarios/two-tooltips.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const ReversedContent = page.getByTestId('reversed-content');
const BoldTrigger = page.getByTestId('bold-trigger');
const BoldContent = page.getByTestId('bold-content');
const ItalicContent = page.getByTestId('italic-content');
const FirstRoot = page.getByTestId('first-root');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstContent = page.getByTestId('first-content');
const SecondRoot = page.getByTestId('second-root');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondContent = page.getByTestId('second-content');
const PopoverTrigger = page.getByTestId('popover-trigger');
const PopoverContent = page.getByTestId('popover-content');
const Calls = page.getByTestId('calls');
const Last = page.getByTestId('last');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The family's own default, restated here so a row that waits on it says why.
const DELAY = 600;

// Where an anchored box may land and still be the placement the CSS asked for.
const SLACK = 1.5;

// The family ships `position-area: block-start` inside `@layer markless`, so one
// unlayered rule of the consumer's own moves a tip. This IS the consumer half of
// the contract, written the way the docs write it.
const CONSUMER_CSS = `
[data-testid="reversed-content"] { position-area: block-end; }
`;

let sheet: HTMLStyleElement | undefined;

beforeEach(() => {
	sheet = document.createElement('style');
	sheet.textContent = CONSUMER_CSS;
	document.head.appendChild(sheet);
});

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a tip enlisted leaves the next row's dismissals going to it.
afterEach(async () => {
	sheet?.remove();
	sheet = undefined;
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function enter(target: Element, pointerType = 'mouse') {
	target.dispatchEvent(
		new PointerEvent('pointerover', { bubbles: true, pointerType, relatedTarget: null }),
	);
}

function leave(target: Element, to: Element | null) {
	target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: to }));
}

function press(target: Element) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function expectHidden(content: Element) {
	expect(content.hasAttribute('hidden')).toBe(true);
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(content.hasAttribute('ui-open')).toBe(false);
	expect(document.contains(content)).toBe(true);
}

function expectShowing(content: Element) {
	expect(content.hasAttribute('hidden')).toBe(false);
	expect(content.getAttribute('ui-open')).toBe('');
	expect(content.hasAttribute('ui-closed')).toBe(false);
}

// The family writes no style attribute at all: the anchor is three rules in the
// parts' own scoped <style> blocks, so the witness is the computed value. One
// name for every tooltip, confined to a root's subtree by `anchor-scope`.
const ANCHOR = '--ui-tooltip';

function expectAnchorWired(root: HTMLElement, trigger: HTMLElement, content: HTMLElement) {
	expect(root.getAttribute('style')).toBe(null);
	expect(trigger.getAttribute('style')).toBe(null);
	expect(content.getAttribute('style')).toBe(null);
	expect(getComputedStyle(root).getPropertyValue('anchor-scope')).toBe(ANCHOR);
	expect(getComputedStyle(trigger).getPropertyValue('anchor-name')).toBe(ANCHOR);
	const tip = getComputedStyle(content);
	expect(tip.position).toBe('absolute');
	expect(tip.getPropertyValue('position-anchor')).toBe(ANCHOR);
}

// A tip sitting above a trigger it is authored after: static flow would put it
// below, so this placement is unreachable without a resolved anchor. The
// computed value is asserted beside it so a miss says which half broke.
function expectPlacedAbove(content: Element, trigger: Element) {
	expect(getComputedStyle(content).getPropertyValue('position-anchor')).toBe(ANCHOR);
	const tip = content.getBoundingClientRect();
	const anchor = trigger.getBoundingClientRect();
	expect(tip.width).toBeGreaterThan(0);
	expect(tip.height).toBeGreaterThan(0);
	expect(Math.abs(tip.bottom - anchor.top)).toBeLessThanOrEqual(SLACK);
}

async function showByHover(trigger: Element, content: Element) {
	enter(trigger);
	await expect.poll(() => content.hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
}

for (const mode of MODES) {
	// The row most implementations fail: the announcement path must not depend on
	// the visual one. accname exposes a directly referenced hidden node, so this is
	// the whole reason the reference is permanent.
	test(`${mode}: the trigger describes the tip while the tip is hidden`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expectHidden(el(Content));
		expect(el(Content).id).toBeTruthy();
		expect(el(Trigger).getAttribute('aria-describedby')).toBe(el(Content).id);
	});

	test(`${mode}: the tip is a tooltip, is elevated, and starts hidden`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(Content).getAttribute('role')).toBe('tooltip');
		expect(el(Content).hasAttribute('overlay')).toBe(true);
		expect(el(Trigger).getAttribute('type')).toBe('button');
		expect(el(Root).getAttribute('ui-closed')).toBe('');
		expectHidden(el(Content));
	});

	test(`${mode}: the trigger declares the anchor the tip points at`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expectAnchorWired(el(Root), el(Trigger), el(Content));
	});

	test(`${mode}: a root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const root = el(Root);
		expect(root.hasAttribute('open')).toBe(false);
		expect(root.hasAttribute('delay')).toBe(false);
	});

	// Placement is CSS, never a prop: the family ships one default inside its own
	// layer, and any unlayered rule the consumer writes beats it with no
	// specificity fight.
	test(`${mode}: the tip takes the family default placement, and a consumer's rule wins`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const content = el(Content);
		expect(getComputedStyle(content).getPropertyValue('position-area')).toBe('block-start');

		const own = document.createElement('style');
		own.textContent = '[data-testid="content"] { position-area: inline-end; }';
		document.head.appendChild(own);
		try {
			expect(getComputedStyle(content).getPropertyValue('position-area')).toBe('inline-end');
		} finally {
			own.remove();
		}
	});

	// Every tooltip on the page declares the SAME anchor name, so isolation is the
	// whole claim: each root confines the name to its own subtree. Without that,
	// `position-anchor` resolves to the last matching anchor in tree order and
	// BOTH tips stack against the second trigger, which the geometry catches.
	test(`${mode}: two co-rendered tooltips each land against their own trigger`, async () => {
		if (mode === 'CSR') await render(TwoTooltips);
		else await renderSSR(TwoTooltips);

		const first = el<HTMLElement>(FirstTrigger);
		const second = el<HTMLElement>(SecondTrigger);
		expectAnchorWired(el(FirstRoot), first, el<HTMLElement>(FirstContent));
		expectAnchorWired(el(SecondRoot), second, el<HTMLElement>(SecondContent));

		expect(el(FirstContent).id).not.toBe(el(SecondContent).id);
		expect(first.getAttribute('aria-describedby')).toBe(el(FirstContent).id);
		expect(second.getAttribute('aria-describedby')).toBe(el(SecondContent).id);

		const firstBox = first.getBoundingClientRect();
		const secondBox = second.getBoundingClientRect();
		// The row is only worth anything while the two triggers are far apart.
		expect(secondBox.top - firstBox.top).toBeGreaterThan(SLACK * 4);

		const firstTip = el(FirstContent).getBoundingClientRect();
		const secondTip = el(SecondContent).getBoundingClientRect();
		expect(firstTip.width).toBeGreaterThan(0);
		expect(secondTip.width).toBeGreaterThan(0);
		expect(Math.abs(firstTip.bottom - firstBox.top)).toBeLessThanOrEqual(SLACK);
		expect(Math.abs(secondTip.bottom - secondBox.top)).toBeLessThanOrEqual(SLACK);
	});

	test(`${mode}: the pointer route reports each change to the consumer`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		expect(el(Calls).textContent).toBe('0');

		enter(el(Trigger));
		await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
		expect(el(Calls).textContent).toBe('1');
		expect(el(Last).textContent).toBe('true');

		leave(el(Trigger), el(Background));
		await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
		expect(el(Calls).textContent).toBe('2');
		expect(el(Last).textContent).toBe('false');
	});

	// The other route, and the reason both are worth a row: focus and blur sit on
	// the trigger, a different component from the one that stored the slot.
	test(`${mode}: the focus route reports each change to the consumer`, async () => {
		if (mode === 'CSR') await render(WithOnChange);
		else await renderSSR(WithOnChange);
		expect(el(Calls).textContent).toBe('0');

		el<HTMLElement>(Trigger).focus();
		await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
		await expect.poll(() => el(Calls).textContent).toBe('1');
		expect(el(Last).textContent).toBe('true');

		el<HTMLElement>(Background).focus();
		await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el(Calls).textContent).toBe('2');
		expect(el(Last).textContent).toBe('false');
	});
}

test('CSR: the pointer has to rest for the delay before the tip shows', async () => {
	await render(Basic);

	enter(el(Trigger));
	await wait(DELAY / 2);
	expectHidden(el(Content));

	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
	expectShowing(el(Content));
});

// A person who reached the control by keyboard has already declared the intent a
// resting pointer only implies, so there is nothing to wait for.
test('CSR: focus shows the tip at once, and blur hides it', async () => {
	await render(Basic);

	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 200 }).toBe(false);

	el<HTMLElement>(Background).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
});

// WCAG 1.4.13 hoverable, and the whole reason the pointer handlers sit on the root.
test('CSR: moving the pointer from the trigger onto the tip leaves it showing', async () => {
	await render(Toolbar);
	await showByHover(el(BoldTrigger), el(BoldContent));

	leave(el(BoldTrigger), el(BoldContent));
	enter(el(BoldContent));
	await wait(100);
	expectShowing(el(BoldContent));
});

test('CSR: the pointer leaving the whole tooltip hides the tip', async () => {
	await render(Toolbar);
	await showByHover(el(BoldTrigger), el(BoldContent));

	leave(el(BoldContent), el(Background));
	await expect.poll(() => el(BoldContent).hasAttribute('hidden')).toBe(true);
});

// WCAG 1.4.13 persistent. A regression here is silent: an auto-hide looks like
// nothing at all until someone is still reading when it goes.
test('CSR: a showing tip never hides on its own', async () => {
	await render(Toolbar);
	await showByHover(el(BoldTrigger), el(BoldContent));

	await wait(2500);
	expectShowing(el(BoldContent));
});

test('CSR: Escape hides the tip with focus still on the trigger', async () => {
	await render(Basic);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(document.activeElement).toBe(el(Trigger));
});

// The trigger sits outside the tip, so a press on it is an outside press and the
// primitive reports it. That is why the family needs no `closeOnClick` prop and
// no re-open grace: nothing here toggles.
test('CSR: a press on the trigger hides the tip and leaves it hidden', async () => {
	await render(Toolbar);
	await showByHover(el(BoldTrigger), el(BoldContent));

	press(el(BoldTrigger));
	await expect.poll(() => el(BoldContent).hasAttribute('hidden')).toBe(true);
	await wait(150);
	expectHidden(el(BoldContent));
});

test('CSR: a touch crossing never shows the tip', async () => {
	await render(Toolbar);

	enter(el(BoldTrigger), 'touch');
	await wait(150);
	expectHidden(el(BoldContent));
});

// The timer only asks the browser to deliver the crossing again, so a tooltip
// torn down mid-wait leaves a dispatch at a detached node and nothing else.
test('CSR: leaving the page with a pending show timer throws nothing', async () => {
	const failures: string[] = [];
	const record = (event: ErrorEvent) => failures.push(event.message);
	window.addEventListener('error', record);
	try {
		const { container } = await render(Basic);
		enter(el(Trigger));
		(container as unknown as Element).remove();
		await wait(DELAY + 200);
		expect(failures).toEqual([]);
	} finally {
		window.removeEventListener('error', record);
	}
});

// The only way to catch a `position-anchor` that silently did not resolve: an
// unresolved anchor leaves the tip at its static position instead of beside the
// trigger, and CSS reports nothing either way. `ServedOpen` takes the family's
// `block-start` default while the tip is authored last, so static flow would put
// it BELOW the trigger and "above" is a placement only a resolved anchor can
// produce. Chromium is the lane this project runs; the mechanism is Baseline but
// the pixel assertion is engine-specific.
test('CSR: an open tip lands against the trigger it names', async () => {
	await render(ServedOpen);
	expectShowing(el(Content));

	expectPlacedAbove(el(Content), el(Trigger));
});

// Measured, against the expectation: authoring the tip FIRST still places it.
// The spec asks that the anchor be laid out strictly before the positioned box,
// and the condition that carries that is "the anchor is not absolutely
// positioned, OR it comes first in flat tree order". This family's trigger is an
// in-flow button, so the first half holds and source order decides nothing. The
// order only starts to matter for a consumer who absolutely positions their own
// trigger, which is what the family's docs warn about.
test('CSR: a tip authored before its trigger is still placed against it', async () => {
	await render(Reversed);
	expectShowing(el(ReversedContent));

	const tip = el(ReversedContent).getBoundingClientRect();
	const anchor = el(Trigger).getBoundingClientRect();
	expect(Math.abs(tip.top - anchor.bottom)).toBeLessThanOrEqual(SLACK);
});

test('CSR: an icon-only trigger keeps its own name and takes the tip as its description', async () => {
	await render(IconButton);

	expect(el(Trigger).getAttribute('aria-label')).toBe('Save');
	expect(el(Trigger).getAttribute('aria-describedby')).toBe(el(Content).id);
	expect(el(Content).textContent).toContain('Save this draft');
});

test('CSR: each tooltip in a toolbar shows only its own tip', async () => {
	await render(Toolbar);
	await showByHover(el(BoldTrigger), el(BoldContent));

	expectHidden(el(ItalicContent));
});

// The layering claim, and the strongest reason a tooltip is its own family
// rather than a popover recipe.
test('CSR: a tooltip inside an open popover shows without closing the popover', async () => {
	await render(InsidePopover);
	el<HTMLElement>(PopoverTrigger).click();
	await expect.poll(() => el(PopoverContent).hasAttribute('hidden')).toBe(false);

	await showByHover(el(Trigger), el(Content));
	expect(el(PopoverContent).hasAttribute('hidden')).toBe(false);
});

// KNOWN DEBT, asserted as it stands rather than as it should be. The overlay
// primitive keeps ONE stack and tells only its topmost entry about a dismissal,
// so the tip - which was going to hide on pointer-leave anyway - swallows the
// press that was meant for the popover under it. The platform's answer is a
// separate stack for hint-tier surfaces; that is a framework change, and the day
// it lands this row flips instead of surprising someone.
test('CSR: a press outside both reaches only the tip, and the popover survives it', async () => {
	await render(InsidePopover);
	el<HTMLElement>(PopoverTrigger).click();
	await expect.poll(() => el(PopoverContent).hasAttribute('hidden')).toBe(false);
	await showByHover(el(Trigger), el(Content));

	el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(el(PopoverContent).hasAttribute('hidden')).toBe(false);
});

test('SSR: the served tip is present, hidden, elevated and fully wired', async () => {
	await renderSSR(Basic);

	expectHidden(el(Content));
	expect(el(Content).getAttribute('role')).toBe('tooltip');
	expect(el(Content).hasAttribute('overlay')).toBe(true);
	expect(el(Content).textContent).toContain('Save this draft');
	expect(el(Trigger).getAttribute('aria-describedby')).toBe(el(Content).id);
	expectAnchorWired(el(Root), el<HTMLElement>(Trigger), el<HTMLElement>(Content));
});

test('SSR: a tip served showing is placed with no interaction at all', async () => {
	await renderSSR(ServedOpen);
	expectShowing(el(Content));

	expectPlacedAbove(el(Content), el(Trigger));
});

test('SSR: the first crossing after resume shows the tip', async () => {
	await renderSSR(Toolbar);
	expectHidden(el(BoldContent));

	await showByHover(el(BoldTrigger), el(BoldContent));
});
