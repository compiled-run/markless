import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import TwoRoots from './fixtures/two-roots.tsrx';
import TwoRootsBare from './fixtures/two-roots-bare.tsrx';
import TwoRootsTyped from './fixtures/two-roots-typed.tsrx';

// A component body may hold several root elements, with or without `;` between them.
afterEach(() => cleanup());

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectTwoRoots(container: HTMLElement) {
	expect(container.querySelector('[data-top]')?.textContent).toBe('top');
	click(container, '[data-count]');
	await expect.poll(() => container.querySelector('[data-count]')?.textContent).toBe('1');
}

test('CSR: a component with two root elements renders both and stays interactive', async () => {
	const screen = await render(TwoRoots);
	await expectTwoRoots(screen.container as HTMLElement);
});

test('SSR: a component with two root elements renders both and stays interactive', async () => {
	const screen = await renderSSR(TwoRoots);
	await expectTwoRoots(screen.container as HTMLElement);
});

test('CSR: two root elements need no separator between them', async () => {
	const screen = await render(TwoRootsBare);
	await expectTwoRoots(screen.container as HTMLElement);
});

test('SSR: two root elements need no separator between them', async () => {
	const screen = await renderSSR(TwoRootsBare);
	await expectTwoRoots(screen.container as HTMLElement);
});

test('CSR: two root elements in a module that carries TypeScript syntax', async () => {
	const screen = await render(TwoRootsTyped);
	await expectTwoRoots(screen.container as HTMLElement);
});

test('SSR: two root elements in a module that carries TypeScript syntax', async () => {
	const screen = await renderSSR(TwoRootsTyped);
	await expectTwoRoots(screen.container as HTMLElement);
});
