import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import NestedForAsync from './fixtures/nested-for-async.tsrx';
import NestedForOuter from './fixtures/nested-for-outer.tsrx';

// Attributes on an inner @for row may read the outer row's item.
afterEach(() => cleanup());

async function expectNestedForOuter(container: HTMLElement) {
	const rows = [...container.querySelectorAll('[data-link]')].map((row) => [
		row.getAttribute('data-link'),
		row.getAttribute('class'),
		row.getAttribute('title'),
	]);
	expect(rows).toEqual([
		['a', 'tier-free', 'free:A'],
		['b', 'tier-free', 'free:B'],
		['c', 'tier-pro', 'pro:C'],
	]);
}

test('CSR: an inner @for row keeps attributes that read the outer row', async () => {
	const screen = await render(NestedForOuter);
	await expectNestedForOuter(screen.container as HTMLElement);
});

test('SSR: an inner @for row keeps attributes that read the outer row', async () => {
	const screen = await renderSSR(NestedForOuter);
	await expectNestedForOuter(screen.container as HTMLElement);
});

async function expectNestedForAsync(container: HTMLElement) {
	await expect.poll(() => container.querySelectorAll('[data-sponsor]').length).toBe(3);
	const rows = [...container.querySelectorAll('[data-sponsor]')].map((row) => [
		row.getAttribute('href'),
		row.getAttribute('class'),
		row.getAttribute('title'),
	]);
	expect(rows).toEqual([
		['https://a.test/', 'link-gold', 'Gold A'],
		['https://b.test/', 'link-gold', 'Gold B'],
		['https://c.test/', 'link-silver', 'Silver C'],
	]);
}

test('SSR: an inner @for over an async computed keeps attributes that read the outer row', async () => {
	const screen = await renderSSR(NestedForAsync);
	await expectNestedForAsync(screen.container as HTMLElement);
});
