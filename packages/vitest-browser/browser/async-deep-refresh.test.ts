import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import DeepTwo from './async-deep-refresh/deep-two.tsrx';
import DeepTwoIf from './async-deep-refresh/deep-two-if.tsrx';
import DeepThree from './async-deep-refresh/deep-three.tsrx';
import DeepThreeIf from './async-deep-refresh/deep-three-if.tsrx';

// An async value in a component two or more levels under the page refreshes when a parent bumps its input.

function click(container: HTMLElement, selector: string) {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

const text = (container: HTMLElement, selector: string) =>
	container.querySelector(selector)?.textContent;

async function refreshCycle(container: HTMLElement) {
	await expect.poll(() => text(container, '[data-name]')).toBe('todo-1');
	const first = Number(text(container, '[data-fetch]'));
	click(container, 'button[data-refresh]');
	await expect.poll(() => Number(text(container, '[data-fetch]'))).toBeGreaterThan(first);
	expect(text(container, '[data-name]')).toBe('todo-1');
	click(container, 'button[data-pick]');
	await expect.poll(() => text(container, '[data-name]')).toBe('todo-2');
}

test('CSR: an async value in a child of the page\'s child refreshes and follows its input', async () => {
	await refreshCycle((await render(DeepTwo)).container as HTMLElement);
});

test('SSR: an async value in a child of the page\'s child refreshes and follows its input', async () => {
	await refreshCycle((await renderSSR(DeepTwo)).container as HTMLElement);
});

test('CSR: an async value under an @if in the page\'s child refreshes and follows its input', async () => {
	const container = (await render(DeepTwoIf)).container as HTMLElement;
	click(container, 'button[data-open]');
	await refreshCycle(container);
});

test('SSR: an async value under an @if in the page\'s child refreshes and follows its input', async () => {
	const container = (await renderSSR(DeepTwoIf)).container as HTMLElement;
	click(container, 'button[data-open]');
	await refreshCycle(container);
});

test('CSR: an async value three components below the page refreshes and follows its input', async () => {
	await refreshCycle((await render(DeepThree)).container as HTMLElement);
});

test('SSR: an async value three components below the page refreshes and follows its input', async () => {
	await refreshCycle((await renderSSR(DeepThree)).container as HTMLElement);
});

test('CSR: an async value under an @if two components below the page refreshes and follows its input', async () => {
	const container = (await render(DeepThreeIf)).container as HTMLElement;
	click(container, 'button[data-open]');
	await refreshCycle(container);
});

test('SSR: an async value under an @if two components below the page refreshes and follows its input', async () => {
	const container = (await renderSSR(DeepThreeIf)).container as HTMLElement;
	click(container, 'button[data-open]');
	await refreshCycle(container);
});
