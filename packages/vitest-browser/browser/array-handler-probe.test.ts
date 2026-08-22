import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import App from './fixtures/array-handler-probe.tsrx';

// One handler per event attribute: the composition an author used to spell as a
// handler array is now a closure, and it still runs every call in order.
afterEach(() => cleanup());

function readProbe(container: ParentNode) {
	return {
		first: container.querySelector('[data-first]')?.textContent,
		second: container.querySelector('[data-second]')?.textContent,
		order: container.querySelector('[data-order]')?.textContent,
		solo: container.querySelector('[data-solo-count]')?.textContent,
	};
}

// A click wakes the handler's module before its writes can commit, so the reads
// poll instead of sampling once at a fixed delay.
async function probe(container: ParentNode, expected: ReturnType<typeof readProbe>) {
	container.querySelector<HTMLButtonElement>('[data-probe]')?.click();
	container.querySelector<HTMLButtonElement>('[data-solo]')?.click();
	await expect.poll(() => readProbe(container)).toEqual(expected);
}

const composed = { first: '1', second: '1', order: 'AB', solo: '1' };

test('CSR: a composed closure runs every call it makes, in order', async () => {
	const screen = await render(App);
	await probe(screen.container as HTMLElement, composed);
});

test('SSR: a composed closure runs every call it makes, in order', async () => {
	const screen = await renderSSR(App);
	await probe(screen.container, composed);
});

// The module never loads because the compiler blocks it; the browser sees only a
// failed fetch, so the diagnostic text itself is asserted in the compiler suite.
test('an array of handlers fails the build instead of rendering', async () => {
	await expect(import('./fixtures/array-handler-rejected.tsrx')).rejects.toThrow();
});
