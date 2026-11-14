import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Outer from './outer.tsrx';
import Page from './page.tsrx';
import Pair from './pair.tsrx';
import Rows from './rows.tsrx';
import { releaseAnswers, resetAnswers } from './answers.ts';

// A child's @try arm holds another child with its own @try and @if before the outer @if; both @ifs have the same local id.
afterEach(() => {
	cleanup();
	resetAnswers();
});

const poll = { timeout: 2_000 };
const answered = <Value>(read: () => Value) => () => (releaseAnswers(), read());
const texts = (selector: string) =>
	answered(() => Array.from(document.querySelectorAll(selector), (node) => node.textContent?.trim()));
// The last instance is the one pressed; every other one keeps its first answers.
const press = (selector: string) => userEvent.click([...document.querySelectorAll<HTMLElement>(selector)].at(-1)!);

async function eachIfFlipsInItsOwnRange(instances: number) {
	const shows = (last: string, first: string) => [...Array<string>(instances - 1).fill(first), last];
	await expect.poll(answered(() => document.querySelector('[data-loading]')), poll).toBe(null);
	await expect.poll(texts('[data-outer]'), poll).toEqual(shows('outer 1', 'outer 1'));
	expect(texts('[data-inner]')()).toEqual(shows('inner 1', 'inner 1'));

	await press('[data-outer-more]');
	await expect.poll(texts('[data-outer]'), poll).toEqual(shows('none', 'outer 1'));
	expect(texts('[data-inner]')()).toEqual(shows('inner 1', 'inner 1'));

	await press('[data-inner-more]');
	await expect.poll(texts('[data-inner]'), poll).toEqual(shows('none', 'inner 1'));
	expect(texts('[data-outer]')()).toEqual(shows('none', 'outer 1'));

	await press('[data-outer-more]');
	await expect.poll(texts('[data-outer]'), poll).toEqual(shows('outer 3', 'outer 1'));
	expect(texts('[data-inner]')()).toEqual(shows('none', 'inner 1'));

	await press('[data-inner-more]');
	await expect.poll(texts('[data-inner]'), poll).toEqual(shows('inner 3', 'inner 1'));
	expect(texts('[data-outer]')()).toEqual(shows('outer 3', 'outer 1'));
}

test('CSR: mounted directly, each @if flips only its own range', async () => {
	await render(Outer);
	await eachIfFlipsInItsOwnRange(1);
});

test('SSR: mounted directly, each @if flips only its own range', async () => {
	await renderSSR(Outer);
	await eachIfFlipsInItsOwnRange(1);
});

test('CSR: inside a parent, each @if flips only its own range', async () => {
	await render(Page);
	await eachIfFlipsInItsOwnRange(1);
});

test('SSR: inside a parent, each @if flips only its own range', async () => {
	await renderSSR(Page);
	await eachIfFlipsInItsOwnRange(1);
});

test('CSR: two instances side by side, each flips only its own', async () => {
	await render(Pair);
	await eachIfFlipsInItsOwnRange(2);
});

test('SSR: two instances side by side, each flips only its own', async () => {
	await renderSSR(Pair);
	await eachIfFlipsInItsOwnRange(2);
});

test('CSR: one instance in each row of a list, each flips only its own', async () => {
	await render(Rows);
	await eachIfFlipsInItsOwnRange(2);
});

test('SSR: one instance in each row of a list, each flips only its own', async () => {
	await renderSSR(Rows);
	await eachIfFlipsInItsOwnRange(2);
});
