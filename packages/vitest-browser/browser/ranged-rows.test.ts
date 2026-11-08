import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import RangedRowsPage from './ranged-rows/page.tsrx';

// Keyed rows that are not one element live between row comments and are reordered, added, removed and rebuilt as whole ranges.
afterEach(() => cleanup());

const WAIT = { timeout: 2000, interval: 10 };

function click(root: ParentNode, selector: string) {
	const element = root.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

// Every child of the list in order, so a node stranded outside its row, or a row split apart, shows up.
const sequence = (root: ParentNode, list: string) =>
	[...root.querySelector(`[data-list="${list}"]`)!.children].map((node) =>
		[...node.attributes]
			.filter((attribute) => attribute.name.startsWith('data-'))
			.map((attribute) => `${attribute.name}=${attribute.value}`)
			.join(' '),
	);

const inline = (ids: ReadonlyArray<string>) => [
	'data-head=',
	...ids.flatMap((id) => [`data-term=${id}`, `data-def=${id}`, `data-input=${id}`]),
	'data-tail=',
];
const component = (ids: ReadonlyArray<string>) =>
	ids.flatMap((id) => [`data-cterm=${id}`, `data-cdef=${id}`]);

async function reorderInsertRemove(root: ParentNode) {
	expect(sequence(root, 'inline')).toEqual(inline(['a', 'b', 'c']));
	expect(sequence(root, 'component')).toEqual(component(['a', 'b', 'c']));
	click(root, '[data-reverse]');
	await expect.poll(() => sequence(root, 'inline'), WAIT).toEqual(inline(['c', 'b', 'a']));
	await expect.poll(() => sequence(root, 'component'), WAIT).toEqual(component(['c', 'b', 'a']));
	click(root, '[data-add]');
	await expect.poll(() => sequence(root, 'inline'), WAIT).toEqual(inline(['c', 'b', 'a', 'd']));
	await expect
		.poll(() => sequence(root, 'component'), WAIT)
		.toEqual(component(['c', 'b', 'a', 'd']));
	expect(root.querySelector('[data-def="d"]')?.textContent).toBe('delta');
	expect(root.querySelector('[data-cdef="d"]')?.textContent).toBe('delta');
	click(root, '[data-remove-first]');
	await expect.poll(() => sequence(root, 'inline'), WAIT).toEqual(inline(['b', 'a', 'd']));
	await expect.poll(() => sequence(root, 'component'), WAIT).toEqual(component(['b', 'a', 'd']));
	click(root, '[data-rename]');
	await expect.poll(() => root.querySelector('[data-def="b"]')?.textContent, WAIT).toBe('BETA');
	await expect.poll(() => root.querySelector('[data-cdef="b"]')?.textContent, WAIT).toBe('BETA');
	expect(sequence(root, 'inline')).toEqual(inline(['b', 'a', 'd']));
	expect(sequence(root, 'component')).toEqual(component(['b', 'a', 'd']));
}

async function handlerReadsItsRowAfterMoves(root: ParentNode) {
	click(root, '[data-reverse]');
	await expect.poll(() => sequence(root, 'inline'), WAIT).toEqual(inline(['c', 'b', 'a']));
	click(root, '[data-term="c"]');
	await expect.poll(() => root.querySelector('[data-picked]')?.textContent, WAIT).toBe('c');
	click(root, '[data-add]');
	await expect.poll(() => root.querySelector('[data-term="d"]'), WAIT).not.toBeNull();
	click(root, '[data-term="d"]');
	await expect.poll(() => root.querySelector('[data-picked]')?.textContent, WAIT).toBe('d');
	click(root, '[data-term="a"]');
	await expect.poll(() => root.querySelector('[data-picked]')?.textContent, WAIT).toBe('a');
}

async function textRows(root: ParentNode) {
	const words = () => root.querySelector('[data-list="words"]')!.textContent?.trim();
	expect(words()).toBe('onetwo');
	click(root, '[data-words]');
	await expect.poll(words, WAIT).toBe('twothreeone');
}

async function focusKeptAcrossRefresh(root: ParentNode) {
	const input = root.querySelector<HTMLInputElement>('[data-input="a"]')!;
	input.focus();
	input.value = 'typed';
	click(root, '[data-refresh]');
	click(root, '[data-add]');
	click(root, '[data-rename]');
	await expect.poll(() => root.querySelector('[data-def="b"]')?.textContent, WAIT).toBe('BETA');
	await expect.poll(() => sequence(root, 'inline'), WAIT).toEqual(inline(['a', 'b', 'c', 'd']));
	expect(root.querySelector('[data-input="a"]')).toBe(input);
	expect(document.activeElement).toBe(input);
	expect(input.value).toBe('typed');
}

const csr = async () => (await render(RangedRowsPage)).container;
const ssr = async () => (await renderSSR(RangedRowsPage)).container;

for (const [mode, mount] of [
	['CSR', csr],
	['SSR', ssr],
] as const) {
	test(`${mode}: fragment rows and fragment-component rows reorder, insert, remove and rebuild as whole ranges`, async () => {
		await reorderInsertRemove(await mount());
	});
	test(`${mode}: an event in a fragment row reads its own row's item after the rows move`, async () => {
		await handlerReadsItsRowAfterMoves(await mount());
	});
	test(`${mode}: rows of text alone reorder and insert`, async () => {
		await textRows(await mount());
	});
	test(`${mode}: focus and typed text in a fragment row survive a refresh of the list`, async () => {
		await focusKeptAcrossRefresh(await mount());
	});
}
