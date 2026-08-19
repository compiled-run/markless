import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import GrovePage from './fixtures/grove-page.tsrx';

// A composed child's async-arm records are minted by the CHILD module in its
// own id space. Host and symbol ids took the instance path already; the graph
// node ids did not, so an arm DOM update reading a child computed subscribed
// to a node that does not exist under the qualified id — loud at registration
// (an unhandled rejection out of the settle commit) and dead afterwards. These
// tests cover both halves: the arm registers, and its updates still apply.
afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	return element;
}

test('CSR: a composed child-owned arm registers its child-computed DOM update and stays live', async () => {
	const screen = await render(GrovePage);
	const container = screen.container as HTMLElement;

	// The commit registered the arm: the computed-reading update is the one
	// whose graph node id must carry the child's instance path.
	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Pear early');
	expect(container.querySelector('[data-grove-badge]')?.textContent).toBe('1');

	// Writing the child's state drives the arm's other composed DOM update
	// without a re-settle, which only works if it registered too.
	requireElement<HTMLButtonElement>(container, 'button[data-grove-tally]').click();
	await expect.poll(() => container.querySelector('[data-grove-badge]')?.textContent).toBe('2');
});

test('SSR: a re-settled composed child-owned arm re-registers and stays live', async () => {
	const screen = await renderSSR(GrovePage);
	const container = screen.container as HTMLElement;

	expect(container.querySelector('[data-grove-badge]')?.textContent).toBe('1');

	// Re-settle so the arm is rebuilt by the runtime commit path rather than
	// served by SSR, then prove the rebuilt arm's DOM updates are live.
	requireElement<HTMLButtonElement>(container, 'button[data-grove-reseed]').click();
	await expect
		.poll(() => container.querySelector('[data-crop]')?.textContent)
		.toBe('Pear late');

	requireElement<HTMLButtonElement>(container, 'button[data-grove-tally]').click();
	await expect.poll(() => container.querySelector('[data-grove-badge]')?.textContent).toBe('2');
});
