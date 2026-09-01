import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect, test } from 'vitest';
import UnavailableItem from './scenarios/unavailable-item.tsrx';

const BarFile = page.getByTestId('bar-file');
const BarEdit = page.getByTestId('bar-edit');
const BarView = page.getByTestId('bar-view');

function el<T extends Element = HTMLElement>(locator: { element(): Element | null }) {
	const found = locator.element();
	if (!found) throw new Error('Expected the part to be on the page.');
	return found as T;
}

// The bar hands over to a neighbour by re-delivering the gestures that neighbour
// already answers for itself - a synthetic ArrowDown when travelling with a menu
// open, a synthetic click on hover. A dispatched event reaches a listener that a
// real press would never reach, so the item's own refusal is the only thing
// standing between an item nobody may open and an open menu.

test('CSR: the arrows land on an item nobody may open and it stays shut', async () => {
	await render(UnavailableItem);
	el(BarFile).focus();

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => document.activeElement).toBe(el(BarEdit));
	expect(el(BarEdit).getAttribute('aria-disabled')).toBe('true');
	expect(el(BarEdit).getAttribute('aria-expanded')).toBe('false');
});

test('CSR: an item nobody may open refuses Enter, Space and a press', async () => {
	await render(UnavailableItem);
	el(BarEdit).focus();

	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(BarEdit).getAttribute('aria-expanded')).toBe('false');
	await userEvent.keyboard(' ');
	await expect.poll(() => el(BarEdit).getAttribute('aria-expanded')).toBe('false');
	await userEvent.keyboard('{ArrowDown}');
	await expect.poll(() => el(BarEdit).getAttribute('aria-expanded')).toBe('false');

	el(BarEdit).click();
	await expect.poll(() => el(BarEdit).getAttribute('aria-expanded')).toBe('false');
});

test('CSR: travelling across an item nobody may open opens nothing on the way', async () => {
	await render(UnavailableItem);
	el(BarFile).focus();
	// Travel is the handover path: with a menu already showing, ArrowRight
	// re-delivers an ArrowDown to the neighbour rather than only moving focus.
	await userEvent.keyboard('{Enter}');
	await expect.poll(() => el(BarFile).getAttribute('aria-expanded')).toBe('true');

	await userEvent.keyboard('{ArrowRight}');
	await expect.poll(() => el(BarFile).getAttribute('aria-expanded')).toBe('false');
	expect(el(BarEdit).getAttribute('aria-expanded')).toBe('false');
	expect(el(BarView).getAttribute('aria-expanded')).toBe('false');
});
