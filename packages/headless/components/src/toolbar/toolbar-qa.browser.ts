import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import UnavailablePress from './scenarios/unavailable-press.tsrx';

const Root = page.getByTestId('root');
const Background = page.getByTestId('background');
const Undo = page.getByTestId('undo');
const Redo = page.getByTestId('redo');
const Compare = page.getByTestId('compare');
const Calls = page.getByTestId('calls');
const Last = page.getByTestId('last');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

async function settled() {
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function enter(bar: HTMLElement, first: HTMLElement) {
	bar.focus();
	await expect.poll(() => document.activeElement).toBe(first);
}

// An unavailable control here is `aria-disabled`, not natively disabled: it keeps
// its focus so a person walking the bar still meets it. That is what makes the
// family's own refusal load-bearing - the platform is not refusing anything, and
// the keyboard reaches this control exactly as a mouse does.

test('CSR: Enter and the space bar on a control nobody may use report nothing', async () => {
	await render(UnavailablePress);
	await enter(el(Root), el(Undo));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Redo));

	await userEvent.keyboard('{Enter}');
	await settled();
	expect(el(Calls).textContent).toBe('0');

	await userEvent.keyboard(' ');
	await settled();
	expect(el(Calls).textContent).toBe('0');
	expect(el(Last).textContent).toBe('');
});

test('CSR: a press on a control nobody may use reports nothing', async () => {
	await render(UnavailablePress);
	el(Redo).click();
	await settled();

	expect(el(Calls).textContent).toBe('0');
	// The control beside it still reports, so the refusal is that control's own.
	el(Compare).click();
	await expect.poll(() => el(Calls).textContent).toBe('1');
	expect(el(Last).textContent).toBe('compare');
});

test('CSR: walking onto a control nobody may use still carries the bar tab stop', async () => {
	await render(UnavailablePress);
	await enter(el(Root), el(Undo));

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(Redo).getAttribute('tabindex')).toBe('0');
	expect(el(Undo).getAttribute('tabindex')).toBe('-1');
	// One stop over the whole bar, even when it rests on a control that refuses.
	expect([...el(Root).querySelectorAll('[tabindex="0"]')].length).toBe(1);

	// And the walk carries on past it rather than being stuck there.
	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(Compare));
});

test('CSR: leaving the bar and coming back returns to the control it left', async () => {
	await render(UnavailablePress);
	await enter(el(Root), el(Undo));

	await userEvent.keyboard('{End}');
	await expect.poll(() => document.activeElement).toBe(el(Compare));

	el<HTMLElement>(Background).focus();
	await expect.poll(() => document.activeElement).toBe(el(Background));

	// The bar took itself out of the tab order on the way in, so coming back means
	// arriving at the roving stop - and that is the control the walk left on.
	el(Root).focus();
	await expect.poll(() => document.activeElement).toBe(el(Compare));
	expect(el(Undo).getAttribute('tabindex')).toBe('-1');
});
