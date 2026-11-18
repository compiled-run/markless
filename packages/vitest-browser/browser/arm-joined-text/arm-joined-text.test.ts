import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import AsyncPage from './async-page.tsrx';
import StatePage from './state-page.tsrx';

// Two interpolations in one text node, one of them an expression, inside an arm that flips.
afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent ?? null;
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function pinAsyncArm() {
	await expect.poll(() => text('[data-label]')).toBe('1 / 2');
	click('[data-next]');
	await expect.poll(() => text('[data-label]')).toBe('2 / 2');
	click('[data-hide]');
	await expect.poll(() => text('[data-label]')).toBeNull();
	click('[data-next]');
	click('[data-hide]');
	await expect.poll(() => text('[data-label]')).toBe('3 / 2');
	click('[data-next]');
	await expect.poll(() => text('[data-label]')).toBe('4 / 2');
}

async function pinStateArm() {
	expect(text('[data-pair]')).toBe('10 of 3 done');
	click('[data-step]');
	await expect.poll(() => text('[data-pair]')).toBe('20 of 4 done');
	click('[data-open]');
	await expect.poll(() => text('[data-pair]')).toBeNull();
	click('[data-step]');
	click('[data-open]');
	await expect.poll(() => text('[data-pair]')).toBe('30 of 5 done');
	click('[data-step]');
	await expect.poll(() => text('[data-pair]')).toBe('40 of 6 done');
}

test('CSR: an @if over an async list rebuilds a label joining an expression and a count', async () => {
	await render(AsyncPage);
	await pinAsyncArm();
});

test('SSR resume: an @if over an async list rebuilds a label joining an expression and a count', async () => {
	await renderSSR(AsyncPage);
	await pinAsyncArm();
});

test('CSR: an @if on state rebuilds a text joining two expressions', async () => {
	await render(StatePage);
	await pinStateArm();
});

test('SSR resume: an @if on state rebuilds a text joining two expressions', async () => {
	await renderSSR(StatePage);
	await pinStateArm();
});
