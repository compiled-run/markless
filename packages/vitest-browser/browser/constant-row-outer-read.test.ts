import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './constant-row-outer-read/crr-page.tsrx';

afterEach(() => cleanup());

const rows = () =>
	[...document.querySelectorAll('[data-mark]')].map(
		(li) => `${li.getAttribute('data-mark')}:${li.className.split(' ').find((name) => name === 'on' || name === 'off')}:${li.querySelector('[data-says]')?.textContent}`,
	);
const nested = () =>
	[...document.querySelectorAll('[data-nested]')].map(
		(node) => `${node.getAttribute('data-nested')}:${node.className.split(' ').find((name) => name === 'on' || name === 'off')}`,
	);

const strokes = () =>
	[...document.querySelectorAll('[data-stroke]')].map(
		(node) => `${node.getAttribute('data-stroke')}:${node.getAttribute('class')}`,
	);

// Rows over a module constant still read state declared outside the @for.
async function constantRowsFollowOuterState() {
	expect(rows()).toEqual(['a:off:no', 'b:off:no', 'c:off:no']);
	expect(nested()).toEqual(['x:off', 'y:off', 'z:off']);
	document.querySelector<HTMLElement>('[data-press="b"]')!.click();
	await expect.poll(rows).toEqual(['a:off:no', 'b:on:yes', 'c:off:no']);
	document.querySelector<HTMLElement>('[data-nested="y"]')!.click();
	await expect.poll(nested).toEqual(['x:off', 'y:on', 'z:off']);
	expect(rows()).toEqual(['a:off:no', 'b:off:no', 'c:off:no']);
	expect(strokes()).toEqual(['0:swipe', '1:swipe']);
	document.querySelector<HTMLElement>('[data-draw]')!.click();
	await expect.poll(strokes).toEqual(['0:swipe', '1:swipe pressed']);
}

test('CSR: rows over a constant array follow state read from outside the @for', async () => {
	await render(Page);
	await constantRowsFollowOuterState();
});

test('SSR: rows over a constant array follow state read from outside the @for', async () => {
	await renderSSR(Page);
	await constantRowsFollowOuterState();
});
