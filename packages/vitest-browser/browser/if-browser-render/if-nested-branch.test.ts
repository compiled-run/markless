import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Facets from './arg-facets.tsrx';

afterEach(cleanup);

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

const list = () => document.querySelector<HTMLElement>('[data-list]');
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function facetsRenderFreshAndStayLive() {
	const option = () => document.querySelector('[data-option]')?.getAttribute('data-checked');
	expect(option()).toBe('false');
	expect(document.querySelector('[data-clear]')).toBeNull();
	click('[data-option]');
	await expect.poll(option).toBe('true');
	await expect.poll(() => document.querySelector('[data-clear]')).not.toBeNull();
	const first = list()!;
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-toggle]');
	await expect.poll(list).not.toBeNull();
	expect(list()).not.toBe(first);
	expect(option()).toBe('true');
	expect(document.querySelector('[data-clear]')).not.toBeNull();
	click('[data-clear]');
	await expect.poll(option).toBe('false');
	await expect.poll(() => document.querySelector('[data-clear]')).toBeNull();
	expect(document.querySelector('[data-chosen]')?.textContent).toBe('0');
	click('[data-option]');
	await expect.poll(() => document.querySelector('[data-clear]')).not.toBeNull();
	expect(errors).toEqual([]);
}

test('CSR: an @if around a nested @if renders it fresh, and the nested @if keeps flipping', async () => {
	await render(Facets);
	await facetsRenderFreshAndStayLive();
});

test('SSR: an @if around a nested @if renders it fresh, and the nested @if keeps flipping', async () => {
	await renderSSR(Facets);
	await facetsRenderFreshAndStayLive();
});
