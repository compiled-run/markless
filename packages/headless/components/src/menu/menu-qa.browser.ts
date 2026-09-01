import { render } from '@markless/vitest-browser';
import { page } from 'vite-plus/test/browser';
import { afterEach, expect, test } from 'vitest';
import UnavailableKinds from './scenarios/unavailable-kinds.tsrx';

// The overlay behaviour keeps one module-level stack for the whole page, so a row
// that leaves a surface enlisted leaves the next row's dismissals going to it.
afterEach(async () => {
	for (let unwind = 0; unwind < 4; unwind++) {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
});

const QUIET_MS = 800;

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

function text(testid: string): string {
	return el(testid).textContent ?? '';
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function press(target: Element) {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
}

function keyOn(target: Element, key: string) {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

function hover(target: Element, from: Element | null = null) {
	target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, relatedTarget: from }));
}

async function openTheMenu() {
	press(el('trigger'));
	await expect.poll(() => el('content').hasAttribute('hidden'), { timeout: 5000 }).toBe(false);
}

// An item nobody may activate reaches activation down a different path for each
// kind it can be: a press, the keyboard's route through the item's own click
// rule, a nesting item's open key, and hover intent. Each path carries its own
// refusal, and a `<div role="menuitem">` has no native disabled to fall back on.

test('CSR: the keyboard never activates a selection item nobody may use', async () => {
	await render(UnavailableKinds);
	await openTheMenu();

	el<HTMLElement>('item-minimap').focus();
	keyOn(el('item-minimap'), 'Enter');
	await wait(QUIET_MS);

	// The menu stays up. Enter on a selection item is what takes the chain down,
	// and an item that never activated has nothing to take it down for.
	expect(el('content').hasAttribute('hidden')).toBe(false);
	expect(text('calls')).toBe('0');
	expect(el('item-minimap').getAttribute('aria-checked')).toBe('false');
});

test('CSR: the space bar never activates a selection item nobody may use', async () => {
	await render(UnavailableKinds);
	await openTheMenu();

	el<HTMLElement>('item-minimap').focus();
	keyOn(el('item-minimap'), ' ');
	await wait(QUIET_MS);

	expect(el('content').hasAttribute('hidden')).toBe(false);
	expect(text('calls')).toBe('0');
	expect(el('item-minimap').getAttribute('aria-checked')).toBe('false');
});

test('CSR: the keyboard never activates a command nobody may use', async () => {
	await render(UnavailableKinds);
	await openTheMenu();

	el<HTMLElement>('item-print').focus();
	keyOn(el('item-print'), 'Enter');
	await wait(QUIET_MS);

	expect(el('content').hasAttribute('hidden')).toBe(false);
	expect(text('calls')).toBe('0');
});

test('CSR: a submenu nobody may open stays shut on the open keys and on hover', async () => {
	await render(UnavailableKinds);
	await openTheMenu();

	el<HTMLElement>('sub-item').focus();
	keyOn(el('sub-item'), 'ArrowRight');
	await wait(QUIET_MS);
	expect(el('sub-content').hasAttribute('hidden')).toBe(true);
	expect(el('sub-item').getAttribute('aria-expanded')).toBe('false');

	keyOn(el('sub-item'), 'Enter');
	await wait(QUIET_MS);
	expect(el('sub-content').hasAttribute('hidden')).toBe(true);

	// Hover intent is the other way in, and it consults the same two cells.
	hover(el('sub-item'));
	await wait(QUIET_MS);
	expect(el('sub-content').hasAttribute('hidden')).toBe(true);
	expect(el('sub-item').getAttribute('aria-expanded')).toBe('false');
});

test('CSR: the item beside the refused one still activates', async () => {
	await render(UnavailableKinds);
	await openTheMenu();

	// The refusal is the item's, not the menu's: its neighbour is untouched.
	press(el('item-wrap'));
	await expect.poll(() => text('calls')).toBe('1');
	expect(text('last')).toBe('wrap');
	expect(el('content').hasAttribute('hidden')).toBe(false);
});
