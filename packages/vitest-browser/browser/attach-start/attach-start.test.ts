import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vite-plus/test/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Page from './attach-start-page.tsrx';

afterEach(cleanup);

const runs = (selector: string) =>
	document.querySelector(selector)?.getAttribute('data-runs') ?? null;
const text = (selector: string) => document.querySelector(selector)?.textContent;
const settle = (ms = 150) => new Promise((done) => setTimeout(done, ms));
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);

// A server-rendered attach waits for an event handled on or inside its element, or for
// onVisible / onIdle on that element; an element the browser renders starts when it is created.
test('SSR: plain attach waits for an event on or inside its element', async () => {
	await renderSSR(Page);
	await settle();
	expect(runs('[data-host]')).toBe(null);
	expect(runs('[data-self]')).toBe(null);

	await press('[data-outside]');
	await expect.poll(() => text('[data-plain]')).toBe('clicked');
	await settle();
	expect(runs('[data-host]')).toBe(null);

	await press('[data-inside]');
	await expect.poll(() => runs('[data-host]')).toBe('1');
	await press('[data-self]');
	await expect.poll(() => runs('[data-self]')).toBe('1');
	await press('[data-inside]');
	await settle();
	expect(runs('[data-host]')).toBe('1');
});

test('SSR: onVisible on the same element starts attach once it is on screen', async () => {
	await renderSSR(Page);
	await expect.poll(() => runs('[data-visible]')).toBe('1');
	expect(runs('[data-host]')).toBe(null);
});

test('SSR: onIdle on the same element starts attach at idle', async () => {
	await renderSSR(Page);
	await expect.poll(() => runs('[data-idle]')).toBe('1');
	expect(runs('[data-host]')).toBe(null);
});

test('CSR: every attach starts when the browser creates its element', async () => {
	await render(Page);
	for (const selector of [
		'[data-host]',
		'[data-self]',
		'[data-visible]',
		'[data-idle]',
	])
		await expect.poll(() => runs(selector)).toBe('1');
	await press('[data-outside]');
	await expect.poll(() => text('[data-plain]')).toBe('clicked');
	await settle();
	expect(runs('[data-host]')).toBe('1');
});

for (const mode of ['SSR', 'CSR'] as const) {
	test(`${mode}: an element a state change renders starts its attach when it is inserted`, async () => {
		await (mode === 'SSR' ? renderSSR(Page) : render(Page));
		await press('[data-show]');
		await expect.poll(() => runs('[data-shown-plain]')).toBe('1');
		await expect.poll(() => runs('[data-shown-visible]')).toBe('1');
		await press('[data-show]');
		await expect.poll(() => document.querySelector('[data-shown-plain]')).toBe(null);
		await press('[data-show]');
		await expect.poll(() => runs('[data-shown-plain]')).toBe('1');
		await expect.poll(() => runs('[data-shown-visible]')).toBe('1');
		await press('[data-outside]');
		await expect.poll(() => text('[data-plain]')).toBe('clicked');
		await settle();
		expect(runs('[data-shown-plain]')).toBe('1');
		expect(runs('[data-host]')).toBe(mode === 'SSR' ? null : '1');
	});
}
