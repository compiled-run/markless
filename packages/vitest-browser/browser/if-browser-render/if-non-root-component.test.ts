import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import CreatePage from './arg-dialogs-page.tsrx';

afterEach(cleanup);

const errors: string[] = [];
const onError = (event: ErrorEvent | PromiseRejectionEvent) =>
	errors.push(String('reason' in event ? event.reason : event.message));
window.addEventListener('error', onError);
window.addEventListener('unhandledrejection', onError);
afterEach(() => void errors.splice(0));

const list = () => document.querySelector<HTMLElement>('[data-list]');
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const current = () => document.querySelector('[data-current]')?.textContent;
const checked = () =>
	[...document.querySelectorAll('[data-item]')].map(
		(row) => `${row.getAttribute('data-item')}:${row.getAttribute('data-checked')}`,
	);

async function reopen() {
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-toggle]');
	await expect.poll(list).not.toBeNull();
}

// The palette closes on a choice, so each opening has to show what its state holds by then.
async function rowsRenderFresh() {
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	const first = list()!;
	await reopen();
	expect(list()).not.toBe(first);
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	click('[data-item="nova"]');
	await expect.poll(current).toBe('nova');
	await reopen();
	expect(checked()).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-reset]');
	await expect.poll(current).toBe('maia');
	click('[data-toggle]');
	await expect.poll(checked).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	click('[data-item="lyra"]');
	await expect.poll(current).toBe('lyra');
	expect(errors).toEqual([]);
}

test('CSR: an @if in a component that is not its module root renders its rows fresh', async () => {
	await render(CreatePage);
	await rowsRenderFresh();
});

test('SSR: an @if in a component that is not its module root renders its rows fresh', async () => {
	await renderSSR(CreatePage);
	await rowsRenderFresh();
});
