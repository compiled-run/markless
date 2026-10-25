import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AsyncPairPage from './fixtures/mutual-recursion/async-pair-page.tsrx';
import PairPage from './fixtures/mutual-recursion/pair.tsrx';
import RingPage from './fixtures/mutual-recursion/ring.tsrx';
import ThreadPage from './fixtures/mutual-recursion/thread-page.tsrx';

// Components of one file that render each other: each level is one more
// component edge with its own instance path, state and symbol routes. Files that
// render each other are refused at build time (bundler mutual-recursion-build).
afterEach(() => cleanup());

const texts = (container: ParentNode, selector: string) =>
	[...container.querySelectorAll(selector)].map((element) => element.textContent);

function click(container: ParentNode, selector: string, index: number) {
	container.querySelectorAll<HTMLElement>(selector)[index]?.click();
}

async function expectFlipsPerLevel(container: ParentNode) {
	expect(texts(container, '[data-inner]').length).toBe(3);
	expect(texts(container, '[data-flip]')).toEqual(['open', 'open', 'open']);
	click(container, '[data-flip]', 0);
	await expect.poll(() => texts(container, '[data-flip]')).toEqual(['closed', 'open', 'open']);
	click(container, '[data-flip]', 2);
	await expect.poll(() => texts(container, '[data-flip]')).toEqual(['closed', 'open', 'closed']);
	click(container, '[data-flip]', 0);
	await expect.poll(() => texts(container, '[data-flip]')).toEqual(['open', 'open', 'closed']);
}

async function expectRingHits(container: ParentNode) {
	expect(
		[...container.querySelectorAll('[data-ring-c]')].map((c) => c.getAttribute('data-left')),
	).toEqual(['2', '1', '0']);
	expect(texts(container, '[data-ring-hit]')).toEqual(['0', '0', '0']);
	click(container, '[data-ring-hit]', 1);
	await expect.poll(() => texts(container, '[data-ring-hit]')).toEqual(['0', '1', '0']);
	click(container, '[data-ring-hit]', 2);
	click(container, '[data-ring-hit]', 0);
	await expect.poll(() => texts(container, '[data-ring-hit]')).toEqual(['1', '1', '1']);
}

test('CSR: two components of one file that render each other unroll, each level its own state', async () => {
	const screen = await render(PairPage);
	await expectFlipsPerLevel(screen.container);
});

test('SSR resume: the first click on any level of a two-component cycle answers', async () => {
	const screen = await renderSSR(PairPage);
	await expectFlipsPerLevel(screen.container);
});

test('CSR: a three-component cycle unrolls and each level counts its own clicks', async () => {
	const screen = await render(RingPage);
	await expectRingHits(screen.container);
});

test('SSR resume: a three-component cycle resumes per level', async () => {
	const screen = await renderSSR(RingPage);
	await expectRingHits(screen.container);
});

test('SSR resume: a two-component cycle whose levels await their own value', async () => {
	const screen = await renderSSR(AsyncPairPage);
	await expect
		.poll(() => texts(screen.container, '[data-label]'))
		.toEqual(['level 2', 'level 1', 'level 0']);
	await expectFlipsPerLevel(screen.container);
});

async function expectThread(container: ParentNode) {
	expect(texts(container, '[data-text]')).toEqual(['first', 'second', 'third']);
	await expectFlipsPerLevel(container);
}

test('CSR: a comment and its replies, two components of one file, nest from data', async () => {
	const screen = await render(ThreadPage);
	await expectThread(screen.container);
});

test('SSR resume: a comment and its replies, two components of one file, nest from data', async () => {
	const screen = await renderSSR(ThreadPage);
	await expectThread(screen.container);
});
