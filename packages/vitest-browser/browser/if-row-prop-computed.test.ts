import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import LayerPage from './row-attribute-reads/if-layer-props-computed.tsrx';
import Page from './row-attribute-reads/if-prop-computed.tsrx';
import SkyPage from './row-attribute-reads/if-imported-prop-computed.tsrx';
import ChartPage from './row-attribute-reads/if-imported-layer-props.tsrx';

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

async function rowsReadThePropAfterReopening([first, second, third] = ['lyra', 'maia', 'nova']) {
	const rows = (on: string) => [first, second, third].map((name) => `${name}:${name === on}`);
	expect(checked()).toEqual(rows(second));
	await reopen();
	expect(checked()).toEqual(rows(second));
	click(`[data-item="${third}"]`);
	await expect.poll(checked).toEqual(rows(third));
	await reopen();
	expect(checked()).toEqual(rows(third));
	click(`[data-item="${first}"]`);
	await expect.poll(checked).toEqual(rows(first));
	expect(errors).toEqual([]);
}

const STARS = ['vega', 'rigel', 'deneb'];

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

test('CSR: an @if in a child imported from another file renders rows that read a prop through a computed', async () => {
	await render(SkyPage);
	await rowsReadThePropAfterReopening(STARS);
});

test('SSR: an @if in a child imported from another file renders rows that read a prop through a computed', async () => {
	await renderSSR(SkyPage);
	await rowsReadThePropAfterReopening(STARS);
});

test('CSR: an imported child inside a layer, reading the whole props object', async () => {
	await render(ChartPage);
	await rowsReadThePropAfterReopening(STARS);
});

test('SSR: an imported child inside a layer, reading the whole props object', async () => {
	await renderSSR(ChartPage);
	await rowsReadThePropAfterReopening(STARS);
});
