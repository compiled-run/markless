import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import ForOverSet from './for-over-set/page.tsrx';

// @for straight over a state Set or Map renders its members on first render and follows later writes.
afterEach(() => cleanup());

const shown = (root: ParentNode) => ({
	tags: [...root.querySelectorAll('[data-tag]')].map((li) => li.textContent),
	votes: [...root.querySelectorAll('[data-vote]')].map((li) => li.textContent),
});

async function iterableRows(root: ParentNode) {
	expect(shown(root)).toEqual({ tags: ['jazz', 'bebop'], votes: ['pizza:2', 'tacos:1'] });
	root.querySelector<HTMLElement>('[data-add]')!.click();
	await expect.poll(() => shown(root).tags).toEqual(['jazz', 'bebop', 'swing']);
	root.querySelector<HTMLElement>('[data-drop]')!.click();
	await expect.poll(() => shown(root).tags).toEqual(['bebop', 'swing']);
	root.querySelector<HTMLElement>('[data-vote-pizza]')!.click();
	await expect.poll(() => shown(root).votes).toEqual(['pizza:3', 'tacos:1']);
	root.querySelector<HTMLElement>('[data-add-sushi]')!.click();
	await expect.poll(() => shown(root).votes).toEqual(['pizza:3', 'tacos:1', 'sushi:1']);
}

test('CSR: @for over a state Set or Map renders its members', async () => {
	await iterableRows((await render(ForOverSet)).container);
});

test('SSR: @for over a state Set or Map renders its members', async () => {
	await iterableRows((await renderSSR(ForOverSet)).container);
});
