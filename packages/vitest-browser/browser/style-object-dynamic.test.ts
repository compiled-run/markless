import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import StyleObjectDynamic from './fixtures/style-object-dynamic.tsrx';

afterEach(() => cleanup());

function required<T extends Element>(root: ParentNode, selector: string): T {
	const element = root.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

async function assertDynamicStyleBehaviors(container: HTMLElement): Promise<void> {
	// Canonical two-read template literal: percentages resolve against the
	// static 100x50 box, so the computed matrix is deterministic.
	const mover = required<HTMLElement>(container, 'div[data-mover]');
	expect(getComputedStyle(mover).transform).toBe('matrix(1, 0, 0, 1, 10, 10)');
	expect(mover.getAttribute('style')).toContain('translate(10%, 20%)');

	required<HTMLButtonElement>(container, 'button[data-shift]').click();
	await expect.poll(() => getComputedStyle(mover).transform).toBe('matrix(1, 0, 0, 1, 35, 30)');
	expect(mover.getAttribute('style')).toContain('translate(35%, 60%)');
	// Static declarations survive the whole-attribute rewrite.
	expect(getComputedStyle(mover).width).toBe('100px');
	expect(getComputedStyle(mover).height).toBe('50px');

	// A state-backed value going null removes the declaration.
	const tinted = required<HTMLElement>(container, 'p[data-tinted]');
	expect(getComputedStyle(tinted).color).toBe('rgb(255, 0, 0)');
	required<HTMLButtonElement>(container, 'button[data-clear-color]').click();
	await expect.poll(() => getComputedStyle(tinted).color).toBe('rgb(0, 0, 0)');
	expect(tinted.getAttribute('style') ?? '').not.toContain('color:');

	// Dynamic auto-px, then undefined removes the declaration.
	const spaced = required<HTMLElement>(container, 'div[data-spaced]');
	expect(getComputedStyle(spaced).marginTop).toBe('8px');
	required<HTMLButtonElement>(container, 'button[data-clear-gap]').click();
	await expect.poll(() => getComputedStyle(spaced).marginTop).toBe('0px');
	expect(spaced.getAttribute('style') ?? '').not.toContain('margin-top');
}

test('CSR: state()-driven style objects update live computed CSS', async () => {
	const screen = await render(StyleObjectDynamic);
	await assertDynamicStyleBehaviors(screen.container as HTMLElement);
});

test('SSR: resumed style objects render server CSS and update after dispatch', async () => {
	const screen = await renderSSR(StyleObjectDynamic);
	expect(screen.container.querySelector('[data-async-container]')).not.toBeNull();
	expect(screen.container.querySelector('script[type="markless/state"]')).not.toBeNull();
	expect(screen.container.querySelector('script[type="markless/view"]')).not.toBeNull();
	await assertDynamicStyleBehaviors(screen.container);
});
