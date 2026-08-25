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

const Background = page.getByTestId('background');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const BoldTrigger = page.getByTestId('bold-trigger');
const BoldContent = page.getByTestId('bold-content');
const ItalicContent = page.getByTestId('italic-content');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstContent = page.getByTestId('first-content');
const SecondTrigger = page.getByTestId('second-trigger');
const SecondContent = page.getByTestId('second-content');
const PopoverTrigger = page.getByTestId('popover-trigger');
const PopoverContent = page.getByTestId('popover-content');

// The SSR harness rewrites a literal `renderSSR` call site, so the mount cannot be
// passed by reference or hidden in a helper: each test branches on the mode instead.
const MODES = ['CSR', 'SSR'] as const;

// The family's own default, restated here so a row that waits on it says why.
const DELAY = 600;

// Where an anchored box may land and still be the placement the CSS asked for.
const SLACK = 1.5;

// The family emits the anchor identity and nothing else, so the geometry rows
// need the placement a consumer's stylesheet would own. This IS the consumer
// half of the contract, written the way the docs write it.
const CONSUMER_CSS = `
[data-testid$="content"][ui-side="top"] { position-area: top span-all; }
[data-testid$="content"][ui-side="bottom"] { position-area: bottom span-all; }
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

// The identity the family emits: one minted token, spelled as an id for the
// description and as a dashed-ident for the anchor, on the two elements that
// have to agree about it.
function expectAnchorWired(trigger: HTMLElement, content: HTMLElement) {
	const name = trigger.style.getPropertyValue('anchor-name');
	expect(name, 'the trigger declares an anchor name').toMatch(/^--\S+$/);
	expect(content.style.position).toBe('absolute');
	expect(content.style.getPropertyValue('position-anchor')).toBe(name);
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
		expect(el(Content).getAttribute('ui-side')).toBe('top');
		expect(el(Trigger).getAttribute('type')).toBe('button');
		expect(el(Root).getAttribute('ui-closed')).toBe('');
		expectHidden(el(Content));
	});

	test(`${mode}: the trigger declares the anchor the tip points at`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expectAnchorWired(el(Trigger), el(Content));
	});

	test(`${mode}: a root drops the props it destructured`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const root = el(Root);
		expect(root.hasAttribute('open')).toBe(false);
		expect(root.hasAttribute('delay')).toBe(false);
		expect(root.hasAttribute('side')).toBe(false);
	});

	test(`${mode}: two co-rendered tooltips mint distinct anchors and distinct ids`, async () => {
		if (mode === 'CSR') await render(TwoTooltips);
		else await renderSSR(TwoTooltips);

		const first = el<HTMLElement>(FirstTrigger);
		const second = el<HTMLElement>(SecondTrigger);
		expectAnchorWired(first, el<HTMLElement>(FirstContent));
		expectAnchorWired(second, el<HTMLElement>(SecondContent));

		expect(first.style.getPropertyValue('anchor-name')).not.toBe(
			second.style.getPropertyValue('anchor-name'),
		);
		expect(el(FirstContent).id).not.toBe(el(SecondContent).id);
		expect(first.getAttribute('aria-describedby')).toBe(el(FirstContent).id);
		expect(second.getAttribute('aria-describedby')).toBe(el(SecondContent).id);
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
// unresolved anchor leaves the tip at its containing block instead of beside the
// trigger, and CSS reports nothing either way. Chromium is the lane this project
// runs; the mechanism is Baseline but the pixel assertion is engine-specific.
test('CSR: an open tip lands against the trigger it names', async () => {
	await render(ServedOpen);
	expectShowing(el(Content));

	const tip = el(Content).getBoundingClientRect();
	const anchor = el(Trigger).getBoundingClientRect();
	expect(tip.width).toBeGreaterThan(0);
	expect(Math.abs(tip.top - anchor.bottom)).toBeLessThanOrEqual(SLACK);
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
	expectShowing(el(Content));

	const tip = el(Content).getBoundingClientRect();
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
	expectAnchorWired(el<HTMLElement>(Trigger), el<HTMLElement>(Content));
});

test('SSR: a tip served showing is placed with no interaction at all', async () => {
	await renderSSR(ServedOpen);
	expectShowing(el(Content));

	const tip = el(Content).getBoundingClientRect();
	const anchor = el(Trigger).getBoundingClientRect();
	expect(tip.width).toBeGreaterThan(0);
	expect(Math.abs(tip.top - anchor.bottom)).toBeLessThanOrEqual(SLACK);
});

test('SSR: the first crossing after resume shows the tip', async () => {
	await renderSSR(Toolbar);
	expectHidden(el(BoldContent));

	await showByHover(el(BoldTrigger), el(BoldContent));
});
