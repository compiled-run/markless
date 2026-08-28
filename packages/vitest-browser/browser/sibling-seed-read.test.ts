import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR, renderSSRPhased } from '../src/index.ts';
import Page from './fixtures/sbr-page.tsrx';

// A widget root that is itself a part of an enclosing widget seeds its family
// from its own prop. Its sibling parts read that seed at their FIRST render,
// whether they read the shared value directly or through a body computed.
afterEach(() => cleanup());

function node(container: ParentNode, name: string) {
	const found = container.querySelector(`[data-node="${name}"]`);
	if (!found) throw new Error(`Expected the node "${name}".`);
	return found;
}

function expectSeedReachesSiblings(container: ParentNode) {
	const open = node(container, 'open');
	expect(open.querySelector('[data-node-root]')?.hasAttribute('ui-open')).toBe(true);
	expect(open.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(true);
	expect(open.querySelector('[data-node-computed]')?.hasAttribute('ui-open')).toBe(true);
	expect(open.querySelector('[data-node-computed]')?.hasAttribute('hidden')).toBe(false);

	const closed = node(container, 'closed');
	expect(closed.querySelector('[data-node-root]')?.hasAttribute('ui-open')).toBe(false);
	expect(closed.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(false);
	expect(closed.querySelector('[data-node-computed]')?.hasAttribute('ui-open')).toBe(false);
	expect(closed.querySelector('[data-node-computed]')?.hasAttribute('hidden')).toBe(true);
}

test('CSR: a sibling part reads the seed its widget root wrote', async () => {
	const screen = await render(Page);
	expectSeedReachesSiblings(screen.container as HTMLElement);
});

test('SSR: the served HTML already carries the seed on the sibling parts', async () => {
	const phased = await renderSSRPhased(Page);

	const computedTags = phased.html.match(/<div[^>]*data-node-computed[^>]*>/g) ?? [];
	expect(computedTags.length).toBe(2);
	expect(computedTags.filter((tag) => tag.includes('hidden')).length).toBe(1);

	expectSeedReachesSiblings(phased.mount().container);
});

test('SSR resume: the seed survives resume on both nodes', async () => {
	const screen = await renderSSR(Page);
	expectSeedReachesSiblings(screen.container);
});

test('CSR: the first gesture moves the node that was served open', async () => {
	const screen = await render(Page);
	const open = node(screen.container as HTMLElement, 'open');

	(open.querySelector('[data-node-trigger]') as HTMLButtonElement).click();
	await expect
		.poll(() => open.querySelector('[data-node-computed]')?.hasAttribute('hidden'))
		.toBe(true);
	expect(open.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(false);
	expect(node(screen.container as HTMLElement, 'closed').querySelector('[data-node-computed]')?.hasAttribute('hidden')).toBe(true);
});

test('SSR resume: the first gesture moves the node that was served open', async () => {
	const screen = await renderSSR(Page);
	const open = node(screen.container, 'open');

	(open.querySelector('[data-node-trigger]') as HTMLButtonElement).click();
	await expect
		.poll(() => open.querySelector('[data-node-computed]')?.hasAttribute('hidden'))
		.toBe(true);
	expect(open.querySelector('[data-node-direct]')?.hasAttribute('ui-open')).toBe(false);
});
