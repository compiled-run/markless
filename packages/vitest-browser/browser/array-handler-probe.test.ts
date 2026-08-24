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

// This probe used to assert the array form fails the build. The owner ruled
// event arrays in (authored order, platform semantics), so the same fixture now
// witnesses the positive contract: every handler fires once per click,
// first-listed first. The deep coverage lives in multi-binding.test.ts.
//
// Defect 89, fixed: render-data emitted one interaction record per array entry
// and gave each the whole handler list, so direct CSR attached N listeners and
// ran N handlers apiece ('AAABBBCCC' for three entries).
test('an array of handlers renders and runs in authored order', async () => {
	const { default: Accepted } = await import('./fixtures/array-handler-accepted.tsrx');
	const screen = await render(Accepted);
	const container = screen.container as HTMLElement;
	container.querySelector<HTMLButtonElement>('button')?.click();
	await expect.poll(() => container.querySelector('[data-order]')?.textContent).toBe('ABC');
	expect(container.querySelector('button')?.textContent).toBe('0');
});
