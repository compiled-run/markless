import { afterEach, expect, test } from 'vitest';
import { cleanup, renderSSR } from '../src/index.ts';
import NestedSeedPage from './shared-readers/nested-seed-page.tsrx';
import PlainPage from './shared-readers/plain-page.tsrx';
import ReadersPage from './shared-readers/readers-page.tsrx';
import SeededPage from './shared-readers/seeded-page.tsrx';
import SubtreePage from './shared-readers/subtree-page.tsrx';

// A component that is not its module's root carries the shared() cell it reads, from any file, in any arm or row.
afterEach(() => cleanup());

const text = (root: ParentNode, selector: string) => root.querySelector(selector)?.textContent?.trim();
const click = (root: ParentNode, selector: string) =>
	root.querySelector<HTMLButtonElement>(selector)!.click();

test('SSR: a subtree-scoped value read from another file stays separate per subtree', async () => {
	const { container } = await renderSSR(SubtreePage);
	const content = (name: string) => text(container, `[data-widget="${name}"] [data-remote-content]`);
	expect([content('a'), content('b')]).toEqual(['false', 'false']);
	click(container, '[data-widget="a"] [data-sel-trigger]');
	await expect.poll(() => content('a')).toBe('true');
	expect(content('b')).toBe('false');
	click(container, '[data-widget="b"] [data-sel-trigger]');
	await expect.poll(() => content('b')).toBe('true');
	expect(content('a')).toBe('true');
});

test('SSR: readers in another file, in an @if arm and a @for row, repaint on a write; a container-scoped one too', async () => {
	const { container } = await renderSSR(ReadersPage);
	const shown = () => [
		text(container, '[data-reader]'),
		text(container, '[data-arm-reader]'),
		text(container, '[data-row-reader="one"]'),
		text(container, '[data-row-reader="two"]'),
	];
	expect(shown()).toEqual(['paper', 'paper', 'one paper', 'two paper']);
	click(container, '[data-flip]');
	await expect.poll(shown).toEqual(['ink', 'ink', 'one ink', 'two ink']);
	expect(text(container, '[data-desk-reader]')).toBe('oak');
	click(container, '[data-swap]');
	await expect.poll(() => text(container, '[data-desk-reader]')).toBe('pine');
});

test('SSR: two server requests do not share a visitor value', async () => {
	const seeded = await renderSSR(SeededPage);
	expect(text(seeded.container, '[data-seeded]')).toBe('ink');
	cleanup();
	const plain = await renderSSR(PlainPage);
	expect(text(plain.container, '[data-reader]')).toBe('paper');
});

test('SSR: a sibling of the seeding component renders the seeded value', async () => {
	const { container } = await renderSSR(SeededPage);
	expect(text(container, '[data-reader]')).toBe('ink');
});

test('SSR: a seed written inside a sibling component reaches a reader in a later @if arm', async () => {
	const { container } = await renderSSR(NestedSeedPage);
	expect(text(container, '[data-seeded]')).toBe('ink');
	expect(text(container, '[data-footnote]')).toBe('ink');
});
