import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import StyleObjectReference from './fixtures/style-object-reference.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

async function assertReferencedStyles(container: HTMLElement): Promise<void> {
	// Component-local const with static values lowers to a literal attribute.
	const local = required<HTMLElement>(container, 'div[data-local]');
	const localComputed = getComputedStyle(local);
	expect(localComputed.color).toBe('rgb(0, 128, 0)');
	expect(localComputed.marginTop).toBe('6px');
	expect(local.getAttribute('style')).toBe('color:rgb(0, 128, 0);margin-top:6px;');

	// Module-level const renders identically to the local form.
	const framed = required<HTMLElement>(container, 'div[data-module]');
	const framedComputed = getComputedStyle(framed);
	expect(framedComputed.position).toBe('absolute');
	expect(framedComputed.top).toBe('12px');
	expect(framedComputed.left).toBe('40px');
	expect(framed.getAttribute('style')).toBe('position:absolute;top:12px;left:40px;');

	// Canonical two-read transform through a referenced const: percentages
	// resolve against the static 100x50 box, so the matrix is deterministic.
	const glide = required<HTMLElement>(container, 'div[data-glide]');
	expect(getComputedStyle(glide).transform).toBe('matrix(1, 0, 0, 1, 10, 10)');
	expect(glide.getAttribute('style')).toContain('translate(10%, 20%)');

	required<HTMLButtonElement>(container, 'button[data-shift]').click();
	await expect.poll(() => getComputedStyle(glide).transform).toBe('matrix(1, 0, 0, 1, 35, 30)');
	expect(glide.getAttribute('style')).toContain('translate(35%, 60%)');
	expect(getComputedStyle(glide).width).toBe('100px');
	expect(getComputedStyle(glide).height).toBe('50px');
}

test('CSR: referenced-const style objects render and update live computed CSS', async () => {
	const screen = await render(StyleObjectReference);
	await assertReferencedStyles(screen.container as HTMLElement);
});

test('SSR: resumed referenced-const style objects render server CSS and update after dispatch', async () => {
	const screen = await renderSSR(StyleObjectReference);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	expect(screen.container.querySelector('script[type="markless/state"]')).not.toBeNull();
	expect(screen.container.querySelector('script[type="markless/view"]')).not.toBeNull();
	await assertReferencedStyles(screen.container);
});
