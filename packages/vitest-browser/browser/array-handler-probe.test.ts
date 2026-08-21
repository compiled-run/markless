import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/array-handler-probe.tsrx';

// Records what an array of event handlers does today; the owner has not yet
// ruled whether the array form stays.
afterEach(() => cleanup());

async function probe(container: ParentNode) {
	container.querySelector<HTMLButtonElement>('[data-probe]')?.click();
	container.querySelector<HTMLButtonElement>('[data-solo]')?.click();
	await new Promise((resolve) => setTimeout(resolve, 50));
	return {
		first: container.querySelector('[data-first]')?.textContent,
		second: container.querySelector('[data-second]')?.textContent,
		order: container.querySelector('[data-order]')?.textContent,
		solo: container.querySelector('[data-solo-count]')?.textContent,
	};
}

test('CSR: every handler in an array fires, in authored order', async () => {
	const screen = await render(App);
	expect(await probe(screen.container as HTMLElement)).toEqual({
		first: '1',
		second: '1',
		order: 'AB',
		solo: '1',
	});
});

test('SSR: every handler in an array fires, in authored order', async () => {
	const screen = await renderSSR(App);
	expect(await probe(screen.container)).toEqual({
		first: '1',
		second: '1',
		order: 'AB',
		solo: '1',
	});
});
