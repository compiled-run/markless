import { render, renderSSR } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { afterEach, beforeEach, expect, test } from 'vitest';
import Basic from './scenarios/basic.tsrx';
import Gapped from './scenarios/gapped.tsrx';
import InsidePopover from './scenarios/inside-popover.tsrx';
import Rich from './scenarios/rich.tsrx';
import ServedOpen from './scenarios/served-open.tsrx';
import TwoCards from './scenarios/two-cards.tsrx';
import WithOnChange from './scenarios/with-onchange.tsrx';

const Background = page.getByTestId('background');
const After = page.getByTestId('after');
const Root = page.getByTestId('root');
const Trigger = page.getByTestId('trigger');
const Content = page.getByTestId('content');
const CardName = page.getByTestId('card-name');
const CardFollowers = page.getByTestId('card-followers');
const CardFollow = page.getByTestId('card-follow');
const FirstRoot = page.getByTestId('first-root');
const FirstTrigger = page.getByTestId('first-trigger');
const FirstContent = page.getByTestId('first-content');
const FirstCardName = page.getByTestId('first-card-name');
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

// The family's own defaults, restated here so a row that waits on one says why.
const DELAY = 700;
const CLOSE_DELAY = 300;

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
// that leaves a card enlisted leaves the next row's dismissals going to it.
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

function enter(target: Element, from: Element | null = null, pointerType = 'mouse') {
	target.dispatchEvent(
		new PointerEvent('pointerover', { bubbles: true, pointerType, relatedTarget: from }),
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

function expectHidden(content: Element, trigger: Element) {
	expect(content.hasAttribute('hidden')).toBe(true);
	expect(content.getAttribute('ui-closed')).toBe('');
	expect(content.hasAttribute('ui-open')).toBe(false);
	expect(trigger.getAttribute('aria-expanded')).toBe('false');
	expect(document.contains(content)).toBe(true);
}

function expectShowing(content: Element, trigger: Element) {
	expect(content.hasAttribute('hidden')).toBe(false);
	expect(content.getAttribute('ui-open')).toBe('');
	expect(content.hasAttribute('ui-closed')).toBe(false);
	expect(trigger.getAttribute('aria-expanded')).toBe('true');
}

// The family writes no style attribute of its own: the anchor is three rules in
// the parts' scoped <style> blocks, so the witness is the computed value. One
// name for every card, confined to a root's subtree by `anchor-scope`.
const ANCHOR = '--ui-hovercard';

function expectAnchorWired(root: HTMLElement, trigger: HTMLElement, content: HTMLElement) {
	expect(root.getAttribute('style')).toBe(null);
	expect(trigger.getAttribute('style')).toBe(null);
	expect(getComputedStyle(root).getPropertyValue('anchor-scope')).toBe(ANCHOR);
	expect(getComputedStyle(trigger).getPropertyValue('anchor-name')).toBe(ANCHOR);
	const card = getComputedStyle(content);
	expect(card.position).toBe('absolute');
	expect(card.getPropertyValue('position-anchor')).toBe(ANCHOR);
}

// A `side="top"` card sitting above a trigger it is authored after: static flow
// would put it below, so this placement is unreachable without a resolved anchor.
function expectPlacedAbove(content: Element, trigger: Element) {
	expect(getComputedStyle(content).getPropertyValue('position-anchor')).toBe(ANCHOR);
	const card = content.getBoundingClientRect();
	const anchor = trigger.getBoundingClientRect();
	expect(card.width).toBeGreaterThan(0);
	expect(card.height).toBeGreaterThan(0);
	expect(Math.abs(card.bottom - anchor.top)).toBeLessThanOrEqual(SLACK);
}

async function showByHover(trigger: Element, content: Element) {
	enter(trigger);
	await expect.poll(() => content.hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
}

for (const mode of MODES) {
	// The disclosure contract, asserted rather than assumed: the trigger is a link
	// that says a surface exists and can be entered, before anything is shown.
	test(`${mode}: the trigger is a link reporting a collapsed card it controls`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		const trigger = el(Trigger);
		expect(trigger.localName).toBe('a');
		expect(trigger.getAttribute('href')).toBe('/users/jane');
		expect(el(Content).id).toBeTruthy();
		expect(trigger.getAttribute('aria-controls')).toBe(el(Content).id);
		expectHidden(el(Content), trigger);
	});

	// The sharpest break from tooltip. A description is flattened to one string, so
	// a card carrying links described that way would be one run-on utterance with
	// nothing in it reachable. A copy-paste from the tooltip family fails here.
	test(`${mode}: nothing in the family describes the trigger, and the card has no role`, async () => {
		if (mode === 'CSR') await render(Basic);
		else await renderSSR(Basic);

		expect(el(Trigger).hasAttribute('aria-describedby')).toBe(false);
		expect(el(Content).hasAttribute('role')).toBe(false);
		expect(el(Root).querySelector('[aria-describedby]')).toBe(null);
		expect(el(Root).querySelector('[role="tooltip"]')).toBe(null);
		expect(el(Content).hasAttribute('overlay')).toBe(true);
		expect(el(Content).getAttribute('ui-side')).toBe('bottom');
	});

	test(`${mode}: the trigger declares the anchor the card points at`, async () => {
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
		expect(root.hasAttribute('closeDelay')).toBe(false);
		expect(root.hasAttribute('closedelay')).toBe(false);
		expect(root.hasAttribute('side')).toBe(false);
	});

	// Every card on the page declares the SAME anchor name, so isolation is the
	// whole claim: each root confines the name to its own subtree. The second half
	// is the hazard this family is the first to face - a card holds consumer links,
	// and `a { anchor-name }` would mint duplicates if the scope class could reach
	// them. It cannot: the class lands only on elements this module renders.
	test(`${mode}: two co-rendered cards land against their own trigger, and consumer links mint nothing`, async () => {
		if (mode === 'CSR') await render(TwoCards);
		else await renderSSR(TwoCards);

		const first = el<HTMLElement>(FirstTrigger);
		const second = el<HTMLElement>(SecondTrigger);
		expectAnchorWired(el(FirstRoot), first, el<HTMLElement>(FirstContent));
		expectAnchorWired(el(SecondRoot), second, el<HTMLElement>(SecondContent));

		expect(el(FirstContent).id).not.toBe(el(SecondContent).id);
		expect(first.getAttribute('aria-controls')).toBe(el(FirstContent).id);
		expect(second.getAttribute('aria-controls')).toBe(el(SecondContent).id);

		expect(getComputedStyle(el(FirstCardName)).getPropertyValue('anchor-name')).toBe('none');

		const firstBox = first.getBoundingClientRect();
		const secondBox = second.getBoundingClientRect();
		// The row is only worth anything while the two triggers are far apart.
		expect(secondBox.top - firstBox.top).toBeGreaterThan(SLACK * 4);

		expectPlacedAbove(el(FirstContent), first);
		expectPlacedAbove(el(SecondContent), second);
	});
}

test('CSR: the pointer has to rest for the delay before the card shows', async () => {
	await render(Basic);

	enter(el(Trigger));
	await wait(DELAY / 2);
	expectHidden(el(Content), el(Trigger));

	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
	expectShowing(el(Content), el(Trigger));
});

// The deliberate inversion of tooltip's focus rule. Tabbing along a paragraph of
// links declares interest in none of them, so focus waits exactly as long as a
// resting pointer does.
test('CSR: focus waits the same delay the pointer does', async () => {
	await render(Basic);

	el<HTMLElement>(Trigger).focus();
	await wait(DELAY / 2);
	expectHidden(el(Content), el(Trigger));

	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
	expectShowing(el(Content), el(Trigger));
});

// The adjudication's whole point, and the row Radix's "Remove content from tab
// sequence" commit would fail. It works because the card is the trigger's next
// DOM sibling and closing is scoped to the root: Tab blurs the trigger, and a
// family that closed on that blur could never be entered at all.
test('CSR: Tab from the trigger moves focus into the card, which stays showing', async () => {
	await render(Rich);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(CardName));
	expectShowing(el(Content), el(Trigger));

	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(CardFollowers));
	expectShowing(el(Content), el(Trigger));
});

// No trap. GitHub's hovercards trap focus and have the filed reading-order
// complaints; tabbing past the last thing in the card simply leaves the page
// carrying on, and leaving is what closes it.
test('CSR: Tab past the last thing in the card leaves it and closes it', async () => {
	await render(Rich);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);

	await userEvent.keyboard('{Tab}');
	await userEvent.keyboard('{Tab}');
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(CardFollow));

	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(After));
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
});

// WCAG 1.4.13 hoverable, and the whole reason the pointer handlers sit on the root.
test('CSR: moving the pointer from the trigger onto the card leaves it showing', async () => {
	await render(Rich);
	await showByHover(el(Trigger), el(Content));

	leave(el(Trigger), el(Content));
	enter(el(Content), el(Trigger));
	await wait(100);
	expectShowing(el(Content), el(Trigger));
});

// The row that justifies `closeDelay` existing. The card is out of flow, so a
// margin between it and the trigger is dead space inside neither part: the
// pointer crossing it leaves the root entirely and the card would go with it.
test('CSR: the pointer crossing a real gap between trigger and card keeps it showing', async () => {
	await render(Gapped);
	await showByHover(el(Trigger), el(Content));

	leave(el(Trigger), el(Background));
	await wait(CLOSE_DELAY / 2);
	expectShowing(el(Content), el(Trigger));

	enter(el(Content), el(Background));
	await wait(CLOSE_DELAY + 100);
	expectShowing(el(Content), el(Trigger));
});

test('CSR: the pointer leaving the whole card hides it after the close delay, not before', async () => {
	await render(Gapped);
	await showByHover(el(Trigger), el(Content));

	leave(el(Trigger), el(Background));
	await wait(CLOSE_DELAY / 2);
	expectShowing(el(Content), el(Trigger));

	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(true);
});

// WCAG 1.4.13 persistent. A regression here is silent: an auto-hide looks like
// nothing at all until someone is still reading when it goes.
test('CSR: a showing card never hides on its own', async () => {
	await render(Rich);
	await showByHover(el(Trigger), el(Content));

	await wait(2500);
	expectShowing(el(Content), el(Trigger));
});

// The branch tooltip dropped as dead code. Here it is mandatory: closing while
// focus is inside a subtree that becomes hidden drops focus to the body and loses
// the person's place on the page.
test('CSR: Escape with focus inside the card closes it and hands focus back', async () => {
	await render(Rich);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(CardName));

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(document.activeElement).toBe(el(Trigger));
});

// Popover's rule: a press elsewhere is a person choosing where to be, so the
// family closes and moves nothing.
test('CSR: a press outside closes the card and does not move focus back', async () => {
	await render(Rich);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	await userEvent.keyboard('{Tab}');

	press(el(Background));
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	expect(document.activeElement).not.toBe(el(Trigger));
});

// The family never writes `aria-modal`, so the primitive's modality check never
// matches: nothing outside is marked inert and the page's scroll is its own.
test('CSR: a showing card locks no scroll, marks nothing inert, and survives a wheel', async () => {
	await render(Rich);
	await showByHover(el(Trigger), el(Content));

	expect(document.body.style.overflow).not.toBe('hidden');
	expect(document.querySelector('[inert]')).toBe(null);

	el(Content).dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));
	await wait(100);
	expectShowing(el(Content), el(Trigger));
});

// Touch is refused, and here the refusal costs nothing: a touch user taps the
// link and gets the destination, which holds everything the card holds.
test('CSR: a touch crossing never shows the card', async () => {
	await render(Rich);

	enter(el(Trigger), null, 'touch');
	await wait(150);
	expectHidden(el(Content), el(Trigger));
});

// The timer only asks the browser to deliver the crossing again, so a card torn
// down mid-wait leaves a dispatch at a detached node and nothing else.
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

test('CSR: onChange is called once with each new value, and not for a repeat', async () => {
	await render(WithOnChange);
	expect(el(Calls).textContent).toBe('0');

	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(Last).textContent).toBe('true');

	// Already showing: a second crossing reports nothing.
	enter(el(Trigger), el(Content));
	await wait(100);
	expect(el(Calls).textContent).toBe('1');

	el<HTMLElement>(Background).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(Last).textContent).toBe('false');
});

// The other reporting route, and the reason both are worth a row: the close comes
// from the card's own dismissal rather than from the root's hover and focus
// handlers.
test('CSR: Escape reports the close to the consumer once', async () => {
	await render(WithOnChange);
	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden'), { timeout: 2000 }).toBe(false);
	await expect.poll(() => el(Calls).textContent).toBe('1');

	await userEvent.keyboard('{Escape}');
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
	await expect.poll(() => el(Calls).textContent).toBe('2');
	expect(el(Last).textContent).toBe('false');
});

// The only way to catch a `position-anchor` that silently did not resolve: an
// unresolved anchor leaves the card at its static position instead of beside the
// trigger, and CSS reports nothing either way. `ServedOpen` is `side="top"` while
// the card is authored last, so static flow would put it BELOW and "above" is a
// placement only a resolved anchor can produce.
test('CSR: an open card lands against the trigger it names', async () => {
	await render(ServedOpen);
	expectShowing(el(Content), el(Trigger));

	expectPlacedAbove(el(Content), el(Trigger));
});

// The layering claim: a card opening inside a popover must not take the popover
// down with it.
test('CSR: a card inside an open popover shows without closing the popover', async () => {
	await render(InsidePopover);
	el<HTMLElement>(PopoverTrigger).click();
	await expect.poll(() => el(PopoverContent).hasAttribute('hidden')).toBe(false);

	await showByHover(el(Trigger), el(Content));
	expect(el(PopoverContent).hasAttribute('hidden')).toBe(false);
});

// KNOWN GAP, pinned as what should happen rather than as what does. The overlay
// behaviour keeps ONE stack and tells only its topmost entry about a dismissal,
// so a card enlisted over a popover swallows the press that was meant for the
// popover underneath and the popover stays open. The platform's answer is a
// separate stack for hint-tier surfaces; that is a change to the overlay code in
// the web package, and the day it lands this row goes green instead of
// surprising someone.
test.fails(
	'CSR: a press outside both should reach the popover under the card — known gap: one stack, topmost only',
	async () => {
		await render(InsidePopover);
		el<HTMLElement>(PopoverTrigger).click();
		await expect.poll(() => el(PopoverContent).hasAttribute('hidden')).toBe(false);
		await showByHover(el(Trigger), el(Content));

		el(Background).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(true);
		await expect.poll(() => el(PopoverContent).hasAttribute('hidden')).toBe(true);
	},
);

test('SSR: the served card is present, hidden, elevated and fully wired', async () => {
	await renderSSR(Basic);

	expectHidden(el(Content), el(Trigger));
	expect(el(Content).hasAttribute('role')).toBe(false);
	expect(el(Content).hasAttribute('overlay')).toBe(true);
	expect(el(Content).textContent).toContain('Jane Doe');
	expect(el(Trigger).getAttribute('aria-controls')).toBe(el(Content).id);
	expectAnchorWired(el(Root), el<HTMLElement>(Trigger), el<HTMLElement>(Content));
});

test('SSR: a card served showing is placed with no interaction at all', async () => {
	await renderSSR(ServedOpen);
	expectShowing(el(Content), el(Trigger));

	expectPlacedAbove(el(Content), el(Trigger));
});

test('SSR: the first crossing after resume shows the card', async () => {
	await renderSSR(Rich);
	expectHidden(el(Content), el(Trigger));

	await showByHover(el(Trigger), el(Content));
});

test('SSR: Tab from the trigger reaches into the card after resume', async () => {
	await renderSSR(Rich);

	el<HTMLElement>(Trigger).focus();
	await expect.poll(() => el(Content).hasAttribute('hidden')).toBe(false);
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(el(CardName));
});
