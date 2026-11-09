import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import NestedArmFlip from './nested-arm-flip.tsrx';

// An @if inside the arm of an @if that holds a component, inside a @try, flips its own range.

afterEach(cleanup);

const LOADS = { timeout: 5_000 };
const textOf = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => (document.querySelector(selector) as HTMLElement).click();

async function innerIfFlips() {
	await expect.poll(() => textOf('h3'), LOADS).toBe('account 0');
	await expect.poll(() => textOf('[data-brief]'), LOADS).toBe('brief');
	const [card, badge] = [document.querySelector('[data-card]')!, document.querySelector('[data-badge]')!];
	click('[data-tap]');
	await expect.poll(() => textOf('[data-tap]')).toBe('1');
	click('[data-detail-toggle]');
	await expect.poll(() => textOf('[data-detail]'), LOADS).toBe('details account 0');
	expect(document.querySelector('[data-brief]')).toBe(null);
	expect(document.querySelector('[data-badge]')).toBe(badge);
	expect(textOf('[data-tap]')).toBe('1');
	click('[data-again]');
	await expect.poll(() => textOf('[data-detail]'), LOADS).toBe('details account 1');
	expect(textOf('h3')).toBe('account 1');
	expect(textOf('[data-badge-label]')).toBe('account 1');
	click('[data-detail-toggle]');
	await expect.poll(() => textOf('[data-brief]'), LOADS).toBe('brief');
	expect(document.querySelector('[data-detail]')).toBe(null);
	expect(document.querySelector('[data-card]')).toBe(card);
	click('[data-open]');
	await expect.poll(() => document.querySelector('[data-badge]'), LOADS).toBe(null);
	click('[data-open]');
	await expect.poll(() => textOf('[data-brief]'), LOADS).toBe('brief');
	click('[data-detail-toggle]');
	await expect.poll(() => textOf('[data-detail]'), LOADS).toBe('details account 1');
}

test('CSR: an @if nested in a component-holding @if arm inside a @try flips', async () => {
	await render(NestedArmFlip);
	await innerIfFlips();
});

test('SSR: an @if nested in a component-holding @if arm inside a @try flips after resume', async () => {
	await renderSSR(NestedArmFlip);
	await innerIfFlips();
});
