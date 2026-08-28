// Every recovery below is the gesture that family's own browser suite already
// pins, so a red recovery is a regression rather than this lane inventing a
// contract. Scenarios come from src/<family>/scenarios unchanged.

import { render } from '@markless/vitest-browser';
import { page, userEvent } from 'vite-plus/test/browser';
import { expect } from 'vitest';
import { Basic as ComboboxBasic } from '../src/combobox/scenarios/basic.tsrx';
import DrawerBasic from '../src/drawer/scenarios/basic.tsrx';
import MenuBasic from '../src/menu/scenarios/basic.tsrx';
import { Basic as SelectBasic } from '../src/select/scenarios/basic.tsrx';
import SliderBasic from '../src/slider/scenarios/basic.tsrx';
import TreeNested from '../src/tree/scenarios/nested.tsrx';

export type ChaosFamily = {
	readonly name: string;
	/** Mounts the scenario. CSR only: the SSR marker cannot be reached by reference. */
	mount(): Promise<unknown>;
	/** The part every storm is aimed inside of. */
	readonly rootTestId: string;
	/** Where a keyboard-only storm puts focus before its first keystroke. */
	readonly keyboardEntryTestId: string;
	/** One scripted normal interaction, asserted after the storm. */
	recover(): Promise<void>;
};

function el<T extends Element = HTMLElement>(testid: string): T {
	const found = page.getByTestId(testid).element();
	if (!found) throw new Error(`Expected [data-testid="${testid}"] to be on the page.`);
	return found as unknown as T;
}

function keyOn(target: Element, key: string): void {
	target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** A click with no click count, which is what Enter and Space on a button produce. */
function activate(target: Element): void {
	target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
}

export const families: readonly ChaosFamily[] = [
	{
		name: 'menu',
		mount: () => render(MenuBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		async recover() {
			el('trigger').focus();
			activate(el('trigger'));
			await expect.poll(() => el('content').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('item-cut'));

			keyOn(el('item-cut'), 'ArrowDown');
			await expect.poll(() => document.activeElement).toBe(el('item-copy'));
		},
	},
	{
		name: 'drawer',
		mount: () => render(DrawerBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('content'));

			el('close').click();
			await expect.poll(() => el('backdrop').hasAttribute('hidden')).toBe(true);
			await expect.poll(() => document.activeElement).toBe(el('trigger'));
			expect(document.body.style.overflow).toBe('');
		},
	},
	{
		name: 'select',
		mount: () => render(SelectBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'trigger',
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('trigger').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(false);

			// Choosing what is already chosen is not a change, so recovery always
			// picks an option the storm left unselected.
			const fresh = el('apple').getAttribute('aria-selected') === 'true' ? 'banana' : 'apple';
			el(fresh).click();
			await expect.poll(() => el(fresh).getAttribute('aria-selected')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(true);
		},
	},
	{
		name: 'combobox',
		mount: () => render(ComboboxBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'input',
		async recover() {
			el('trigger').click();
			await expect.poll(() => el('input').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(false);
			await expect.poll(() => document.activeElement).toBe(el('input'));

			el('trigger').click();
			await expect.poll(() => el('input').getAttribute('aria-expanded')).toBe('false');
			await expect.poll(() => el<HTMLElement>('content').hidden).toBe(true);
		},
	},
	{
		name: 'tree',
		mount: () => render(TreeNested),
		rootTestId: 'root',
		keyboardEntryTestId: 'root',
		async recover() {
			// The node may be open or closed after a storm; drive it to closed first
			// so the one gesture measured here is always an open.
			if (el('src-item').getAttribute('aria-expanded') === 'true') {
				el('src-itemtrigger').click();
				await expect.poll(() => el('src-item').hasAttribute('aria-expanded')).toBe(false);
			}

			el('src-itemtrigger').click();
			await expect.poll(() => el('src-item').getAttribute('aria-expanded')).toBe('true');
			await expect.poll(() => el('src-itemcontent').hasAttribute('hidden')).toBe(false);
			expect(el('index-item').getAttribute('aria-level')).toBe('2');
		},
	},
	{
		name: 'slider',
		mount: () => render(SliderBasic),
		rootTestId: 'root',
		keyboardEntryTestId: 'thumb',
		async recover() {
			// Value-relative assertions would depend on where the storm left the
			// thumb, so recovery drives it to a known end first.
			el<HTMLElement>('thumb').focus();
			await userEvent.keyboard('{Home}');
			await expect.poll(() => el('thumb').getAttribute('aria-valuenow')).toBe('0');

			await userEvent.keyboard('{ArrowRight}');
			await expect.poll(() => el('thumb').getAttribute('aria-valuenow')).toBe('1');
			expect(el('valuelabel').textContent?.trim()).toBe('1');
		},
	},
];
