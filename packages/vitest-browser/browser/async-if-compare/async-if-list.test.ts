import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import FullDirectLength from './shapes/direct-length-full.tsrx';
import EmptyDirectLength from './shapes/direct-length-empty.tsrx';
import FullWrappedLength from './shapes/wrapped-length-full.tsrx';
import EmptyWrappedLength from './shapes/wrapped-length-empty.tsrx';
import FullDirectNotNull from './shapes/direct-not-null-full.tsrx';
import EmptyDirectNotNull from './shapes/direct-not-null-empty.tsrx';
import FullWrappedNotNull from './shapes/wrapped-not-null-full.tsrx';
import EmptyWrappedNotNull from './shapes/wrapped-not-null-empty.tsrx';
import FullDirectTruthy from './shapes/direct-truthy-full.tsrx';
import EmptyDirectTruthy from './shapes/direct-truthy-empty.tsrx';
import FullWrappedTruthy from './shapes/wrapped-truthy-full.tsrx';
import EmptyWrappedTruthy from './shapes/wrapped-truthy-empty.tsrx';
import FullDirectComputed from './shapes/direct-computed-full.tsrx';
import EmptyDirectComputed from './shapes/direct-computed-empty.tsrx';
import FullWrappedComputed from './shapes/wrapped-computed-full.tsrx';
import EmptyWrappedComputed from './shapes/wrapped-computed-empty.tsrx';
import PickList from './row-callback.tsrx';

// An @if right inside a @try, or one element in, that tests the async value: by length, against null, truthy, or through a computed.
afterEach(cleanup);

const poll = { timeout: 2_000 };
const text = (selector: string) => document.querySelector(selector)?.textContent?.trim() ?? null;
const press = (selector: string) => userEvent.click(document.querySelector<HTMLElement>(selector)!);
const shapes = [
	{ shape: 'DirectLength', csr: () => render(FullDirectLength), ssr: () => renderSSR(FullDirectLength), csrEmpty: () => render(EmptyDirectLength), ssrEmpty: () => renderSSR(EmptyDirectLength) },
	{ shape: 'WrappedLength', csr: () => render(FullWrappedLength), ssr: () => renderSSR(FullWrappedLength), csrEmpty: () => render(EmptyWrappedLength), ssrEmpty: () => renderSSR(EmptyWrappedLength) },
	{ shape: 'DirectNotNull', csr: () => render(FullDirectNotNull), ssr: () => renderSSR(FullDirectNotNull), csrEmpty: () => render(EmptyDirectNotNull), ssrEmpty: () => renderSSR(EmptyDirectNotNull) },
	{ shape: 'WrappedNotNull', csr: () => render(FullWrappedNotNull), ssr: () => renderSSR(FullWrappedNotNull), csrEmpty: () => render(EmptyWrappedNotNull), ssrEmpty: () => renderSSR(EmptyWrappedNotNull) },
	{ shape: 'DirectTruthy', csr: () => render(FullDirectTruthy), ssr: () => renderSSR(FullDirectTruthy), csrEmpty: () => render(EmptyDirectTruthy), ssrEmpty: () => renderSSR(EmptyDirectTruthy) },
	{ shape: 'WrappedTruthy', csr: () => render(FullWrappedTruthy), ssr: () => renderSSR(FullWrappedTruthy), csrEmpty: () => render(EmptyWrappedTruthy), ssrEmpty: () => renderSSR(EmptyWrappedTruthy) },
	{ shape: 'DirectComputed', csr: () => render(FullDirectComputed), ssr: () => renderSSR(FullDirectComputed), csrEmpty: () => render(EmptyDirectComputed), ssrEmpty: () => renderSSR(EmptyDirectComputed) },
	{ shape: 'WrappedComputed', csr: () => render(FullWrappedComputed), ssr: () => renderSSR(FullWrappedComputed), csrEmpty: () => render(EmptyWrappedComputed), ssrEmpty: () => renderSSR(EmptyWrappedComputed) },
];
const shown = (shape: string, notes: number) =>
	shape.endsWith('Length') ? Array.from({ length: notes }, (_, at) => `note ${'abc'[at]}`).join('') : shape.endsWith('Computed') ? String(notes) : 'note a';

for (const { shape, csr, ssr, csrEmpty, ssrEmpty } of shapes) {
	test(`CSR ${shape}: opens on the first answer`, async () => {
		await csr();
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 1));
	});

	test(`SSR ${shape}: opens on the first answer`, async () => {
		await ssr();
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 1));
	});

	// Not yet: a bare truthy test never opens when its value turns truthy, and a list in an arm that opened late misses the next re-fetch.
	const refetch = shape.endsWith('Length') || shape.endsWith('Truthy') ? test.fails : test;

	refetch(`CSR ${shape}: stays shut on an empty answer and opens after a re-fetch`, async () => {
		await csrEmpty();
		await expect.poll(() => document.querySelector('[data-loading]'), poll).toBe(null);
		expect(document.querySelector('[data-shown]')).toBe(null);
		await press('[data-more]');
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 1));
		await press('[data-more]');
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 2));
	});

	refetch(`SSR ${shape}: stays shut on an empty answer and opens after a re-fetch`, async () => {
		await ssrEmpty();
		expect(document.querySelector('[data-shown]')).toBe(null);
		await press('[data-more]');
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 1));
		await press('[data-more]');
		await expect.poll(() => text('[data-shown]'), poll).toBe(shown(shape, 2));
	});
}

async function picksItsOwnNote() {
	await expect.poll(() => text('[data-picked]'), poll).toBe('none');
	await press('[data-open]');
	await expect.poll(() => text('[data-pick]'), poll).toBe('pick note a');
	await press('[data-pick]');
	await expect.poll(() => text('[data-picked]'), poll).toBe('note a:1');
}

// Not yet: a row built when its arm opens late hands the callback `undefined` for its own prop.
test.fails('CSR: a row built when its @if opens later passes its own prop to the parent callback', async () => {
	await render(PickList);
	await picksItsOwnNote();
});

test.fails('SSR: a row built when its @if opens later passes its own prop to the parent callback', async () => {
	await renderSSR(PickList);
	await picksItsOwnNote();
});
