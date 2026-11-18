import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { Chart } from './attach-async-read/chart.tsrx';
import { SharedMap } from './attach-async-read/shared-map.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;

test('SSR: an async value read only inside attach settles the @try and reaches attach', async () => {
	await renderSSR(Chart);
	await expect.poll(() => text('[data-chart]')).toBe('drawn 3 points');
	expect(document.querySelector('[data-loading]')).toBeNull();
});

test('CSR: an async value read only inside attach settles the @try and reaches attach', async () => {
	await render(Chart);
	await expect.poll(() => text('[data-chart]')).toBe('drawn 3 points');
	expect(document.querySelector('[data-loading]')).toBeNull();
});

test('SSR: attach reading shared() fields beside the async value settles the @try', async () => {
	await renderSSR(SharedMap);
	await expect.poll(() => text('[data-map]')).toBe('fleet at 4: 3 units');
	expect(document.querySelector('[data-loading]')).toBeNull();
});

test('CSR: attach reading shared() fields beside the async value settles the @try', async () => {
	await render(SharedMap);
	await expect.poll(() => text('[data-map]')).toBe('fleet at 4: 3 units');
	expect(document.querySelector('[data-loading]')).toBeNull();
});
