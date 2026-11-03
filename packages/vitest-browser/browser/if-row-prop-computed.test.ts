import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import LayerPage from './row-attribute-reads/if-layer-props-computed.tsrx';
import Page from './row-attribute-reads/if-prop-computed.tsrx';

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

async function reopen() {
	click('[data-toggle]');
	await expect.poll(list).toBeNull();
	click('[data-toggle]');
	await expect.poll(list).not.toBeNull();
}

async function rowsReadThePropAfterReopening() {
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	await reopen();
	expect(checked()).toEqual(['lyra:false', 'maia:true', 'nova:false']);
	click('[data-item="nova"]');
	await expect.poll(checked).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	await reopen();
	expect(checked()).toEqual(['lyra:false', 'maia:false', 'nova:true']);
	click('[data-item="lyra"]');
	await expect.poll(checked).toEqual(['lyra:true', 'maia:false', 'nova:false']);
	expect(errors).toEqual([]);
}

test('CSR: an @if in a same-file child renders rows that read a prop through a computed', async () => {
	await render(Page);
	await rowsReadThePropAfterReopening();
});

test('SSR: an @if in a same-file child renders rows that read a prop through a computed', async () => {
	await renderSSR(Page);
	await rowsReadThePropAfterReopening();
});

test('CSR: the same rows inside a same-file layer, reading the whole props object', async () => {
	await render(LayerPage);
	await rowsReadThePropAfterReopening();
});

test('SSR: the same rows inside a same-file layer, reading the whole props object', async () => {
	await renderSSR(LayerPage);
	await rowsReadThePropAfterReopening();
});
