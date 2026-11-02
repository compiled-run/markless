import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import CardRows from './structured-derived-props/card-rows.tsrx';
import CardRowsOneFile from './structured-derived-props/card-rows-one-file.tsrx';
import Direct from './structured-derived-props/direct.tsrx';
import Forwarded from './structured-derived-props/forwarded.tsrx';

afterEach(() => cleanup());

// The computed label reads an array and an object prop, which only it reads.
async function structuredPropsReachTheComputed(container: HTMLElement, title: string) {
	// The page ships only the fields the computed reads.
	expect(servedState(container)).not.toContain('unread-secret');
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
	expect(card(1).textContent).toBe('alpha-card-title [tag-p-alpha+tag-q-alpha] 0');
	expect(card(2).textContent).toBe('beta-card-title [tag-r-beta] 0');
	card(2).click();
	await expect.poll(() => card(2).textContent).toBe('beta-card-title [tag-r-beta] 1');
	card(1).click();
	await expect
		.poll(() => card(1).textContent)
		.toBe('alpha-card-title [tag-p-alpha+tag-q-alpha] 1');
}

function servedState(container: HTMLElement) {
	return [...container.querySelectorAll('script[type="markless/state"]')]
		.map((script) => script.textContent ?? '')
		.join('');
}

// The row objects live in page state: the child's copy holds only the fields its computed
// reads, and the arrays it reads whole are served once.
function servedOnce(container: HTMLElement) {
	const state = servedState(container);
	for (const text of [
		'tag-p-alpha',
		'tag-q-alpha',
		'tag-r-beta',
		'unread-note-alpha',
		'unread-note-beta',
	])
		expect(state.split(text).length - 1).toBe(1);
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
