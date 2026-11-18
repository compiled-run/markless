import { afterEach, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { cleanup, render, renderServerHTML, renderSSR, renderStream } from '../../src/index.ts';
import Outer from './outer.tsrx';
import Page from './page.tsrx';
import Pair from './pair.tsrx';
import HelperOwned from './helper-owned.tsrx';
import Rows from './rows.tsrx';
import Streamed from './streamed.tsrx';
import Top from './top.tsrx';
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

// A same-module helper owns the @try; the child its arm places afresh after @catch starts from its own state.
test("SSR: a child placed afresh in a same-module helper's @try starts from its own state", async () => {
	await renderSSR(HelperOwned);
	await expect.poll(texts('[data-card]'), poll).toEqual(['refusedRetry']);
	await press('[data-card-more]');
	await press('[data-card-retry]');
	await expect.poll(texts('[data-card]'), poll).toEqual(['card 2']);
	expect(texts('[data-tally]')()).toEqual(['5']);
	await press('[data-tally]');
	await expect.poll(texts('[data-tally]'), poll).toEqual(['6']);
});

// Three levels: the page's own @try holds the child whose @try holds the grandchild's; all three @ifs share a local id.
async function everyLevelFlipsInItsOwnRange() {
	await expect
		.poll(
			answered(() => document.querySelector('[data-loading]')),
			poll,
		)
		.toBe(null);
	const shows = async (top: string, outer: string, inner: string) => {
		await expect.poll(texts('[data-top]'), poll).toEqual([top]);
		await expect.poll(texts('[data-outer]'), poll).toEqual([outer]);
		await expect.poll(texts('[data-inner]'), poll).toEqual([inner]);
	};
	await shows('top 1', 'outer 1', 'inner 1');
	await press('[data-top-more]');
	await shows('none', 'outer 1', 'inner 1');
	await press('[data-inner-more]');
	await shows('none', 'outer 1', 'none');
	await press('[data-outer-more]');
	await shows('none', 'none', 'none');
	await press('[data-top-more]');
	await shows('top 3', 'none', 'none');
	await press('[data-inner-more]');
	await shows('top 3', 'none', 'inner 3');
}

test('CSR: three levels deep, each @if flips only its own range', async () => {
	await render(Top);
	await everyLevelFlipsInItsOwnRange();
});

test('SSR: three levels deep, each @if flips only its own range', async () => {
	await renderSSR(Top);
	await everyLevelFlipsInItsOwnRange();
});

function appendStreamed(container: HTMLElement, html: string): void {
	const holder = document.createElement('template');
	holder.innerHTML = html;
	for (const node of Array.from(holder.content.childNodes)) {
		if (node.nodeName !== 'SCRIPT') {
			container.appendChild(node);
			continue;
		}
		const script = document.createElement('script');
		for (const attribute of Array.from((node as Element).attributes))
			script.setAttribute(attribute.name, attribute.value);
		script.text = node.textContent ?? '';
		container.appendChild(script);
	}
}

test('SSR: the @try holding the child streams after the first flush, and each @if flips only its own range', async () => {
	const { shell, appends } = await renderStream(Streamed);
	expect(appends).toHaveLength(1);
	const { container } = renderServerHTML(shell);
	expect(document.querySelector('[data-shelf-loading]')).not.toBe(null);
	for (const chunk of appends) appendStreamed(container, chunk);
	await eachIfFlipsInItsOwnRange(1);
});
