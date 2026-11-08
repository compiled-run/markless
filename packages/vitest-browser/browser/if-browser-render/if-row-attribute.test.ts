import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Palette from './arg-palette.tsrx';

afterEach(cleanup);

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

const list = () => document.querySelector<HTMLElement>('[data-list]');
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const checked = () =>
	[...document.querySelectorAll('[data-item]')].map(
		(row) => `${row.getAttribute('data-item')}:${row.getAttribute('data-checked')}`,
	);

async function rowsRenderFreshAndStayLive() {
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	const first = list()!;
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-toggle]');
	await expect.poll(list).not.toBeNull();
	expect(list()).not.toBe(first);
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	click('[data-item="nova"]');
	await expect.poll(() => document.querySelector('[data-current]')?.textContent).toBe('nova');
	await expect.poll(checked).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-toggle]');
	await expect.poll(checked).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	click('[data-item="lyra"]');
	await expect.poll(checked).toEqual(['lyra:true', 'maia:false', 'nova:false']);
	expect(errors).toEqual([]);
}

test('CSR: an @if around rows with an attribute binding renders them fresh, and they stay live', async () => {
	await render(Palette);
	await rowsRenderFreshAndStayLive();
});

test('SSR: an @if around rows with an attribute binding renders them fresh, and they stay live', async () => {
	await renderSSR(Palette);
	await rowsRenderFreshAndStayLive();
});
