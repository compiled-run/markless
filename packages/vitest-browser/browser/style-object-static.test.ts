import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import StyleObjectStatic from './fixtures/style-object-static.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

function assertStaticStyles(container: HTMLElement): void {
	const positioned = required<HTMLElement>(container, 'div[data-positioned]');
	const positionedComputed = getComputedStyle(positioned);
	expect(positionedComputed.position).toBe('absolute');
	expect(positionedComputed.top).toBe('12px');
	expect(positionedComputed.left).toBe('40px');

	// Auto-px: numeric px-eligible values gain px in the compiled literal.
	const sized = required<HTMLElement>(container, 'div[data-sized]');
	expect(getComputedStyle(sized).width).toBe('100px');
	expect(sized.getAttribute('style')).toBe('width:100px;');

	// Unitless properties stay numbers with no px.
	const layered = required<HTMLElement>(container, 'div[data-layered]');
	const layeredComputed = getComputedStyle(layered);
	expect(layeredComputed.zIndex).toBe('3');
	expect(layeredComputed.opacity).toBe('0.5');
	expect(layered.getAttribute('style')).toBe('position:relative;z-index:3;opacity:0.5;');
}

test('CSR: static style objects produce correct computed CSS', async () => {
	const screen = await render(StyleObjectStatic);
	assertStaticStyles(screen.container as HTMLElement);
});

test('SSR: server-rendered static style objects produce correct computed CSS', async () => {
	const screen = await renderSSR(StyleObjectStatic);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	assertStaticStyles(screen.container);
});
