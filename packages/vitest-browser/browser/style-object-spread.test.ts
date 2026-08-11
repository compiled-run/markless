import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import StyleObjectSpread from './fixtures/style-object-spread.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function assertSpreadStyles(container: HTMLElement): void {
	// Last write wins at the first-written position, like a merged JS object.
	const merged = required<HTMLElement>(container, 'div[data-merged]');
	const mergedComputed = getComputedStyle(merged);
	expect(mergedComputed.color).toBe('rgb(0, 0, 255)');
	expect(mergedComputed.marginTop).toBe('4px');
	expect(mergedComputed.paddingLeft).toBe('10px');
	expect(merged.getAttribute('style')).toBe(
		'color:rgb(0, 0, 255);margin-top:4px;padding-left:10px;',
	);

	// Compile-time computed keys render their declarations.
	const keyed = required<HTMLElement>(container, 'div[data-keyed]');
	const keyedComputed = getComputedStyle(keyed);
	expect(keyedComputed.letterSpacing).toBe('2px');
	expect(keyedComputed.paddingTop).toBe('6px');
	expect(keyed.getAttribute('style')).toBe('letter-spacing:2px;padding-top:6px;');
}

test('CSR: spread composition and computed keys produce correct computed CSS', async () => {
	const screen = await render(StyleObjectSpread);
	assertSpreadStyles(screen.container as HTMLElement);
});

test('SSR: server-rendered spread composition and computed keys produce correct computed CSS', async () => {
	const screen = await renderSSR(StyleObjectSpread);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	assertSpreadStyles(screen.container);
});
