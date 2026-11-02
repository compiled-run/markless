import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import CardRows from './structured-derived-props/card-rows.tsrx';
import CardRowsOneFile from './structured-derived-props/card-rows-one-file.tsrx';
import Direct from './structured-derived-props/direct.tsrx';
import Forwarded from './structured-derived-props/forwarded.tsrx';

afterEach(() => cleanup());

// The computed label reads an array and an object prop, which only it reads.
async function structuredPropsReachTheComputed(container: HTMLElement, title: string) {
	const button = () => container.querySelector<HTMLButtonElement>(`[data-summary="${title}"]`)!;
	expect(button().textContent).toBe(`${title} [x+y] 3 items, 0 clicks`);
	button().click();
	await expect.poll(() => button().textContent).toBe(`${title} [x+y] 3 items, 1 clicks`);
}

test('CSR: constant array and object props reach an imported child computed', async () => {
	await structuredPropsReachTheComputed(
		(await render(Direct)).container as HTMLElement,
		'direct',
	);
});
test('SSR resume: constant array and object props reach an imported child computed', async () => {
	await structuredPropsReachTheComputed(
		(await renderSSR(Direct)).container as HTMLElement,
		'direct',
	);
});
test('CSR: constant array and object props forwarded through two files reach the computed', async () => {
	await structuredPropsReachTheComputed(
		(await render(Forwarded)).container as HTMLElement,
		'forwarded',
	);
});
test('SSR resume: constant array and object props forwarded through two files reach the computed', async () => {
	await structuredPropsReachTheComputed(
		(await renderSSR(Forwarded)).container as HTMLElement,
		'forwarded',
	);
});

// Each row hands its item object to a child whose computed reads it.
async function rowObjectReachesTheComputed(container: HTMLElement) {
	const card = (id: number) => container.querySelector<HTMLButtonElement>(`[data-card="${id}"]`)!;
	expect(card(1).textContent).toBe('alpha-card-title [p+q] 0');
	expect(card(2).textContent).toBe('beta-card-title [r] 0');
	card(2).click();
	await expect.poll(() => card(2).textContent).toBe('beta-card-title [r] 1');
	card(1).click();
	await expect.poll(() => card(1).textContent).toBe('alpha-card-title [p+q] 1');
}

// The row objects live in page state, so the served payload carries each once.
function servedOnce(container: HTMLElement) {
	const state = [...container.querySelectorAll('script[type="markless/state"]')]
		.map((script) => script.textContent ?? '')
		.join('');
	expect(state.split('alpha-card-title').length - 1).toBe(1);
	expect(state.split('beta-card-title').length - 1).toBe(1);
}

test('CSR: a row item object reaches an imported child computed', async () => {
	await rowObjectReachesTheComputed((await render(CardRows)).container as HTMLElement);
});
test('SSR resume: a row item object reaches an imported child computed, served once', async () => {
	const container = (await renderSSR(CardRows)).container as HTMLElement;
	servedOnce(container);
	await rowObjectReachesTheComputed(container);
});
test('CSR: a row item object forwarded inside one file reaches the computed', async () => {
	await rowObjectReachesTheComputed((await render(CardRowsOneFile)).container as HTMLElement);
});
test('SSR resume: a row item object forwarded inside one file reaches the computed, served once', async () => {
	const container = (await renderSSR(CardRowsOneFile)).container as HTMLElement;
	servedOnce(container);
	await rowObjectReachesTheComputed(container);
});
