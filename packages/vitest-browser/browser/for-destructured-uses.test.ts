import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Uses from './for-destructured-uses/page.tsrx';

// Destructured @for names reach a child's props, a handler, an @if test and a nested @for.
afterEach(() => cleanup());

const rows = (root: ParentNode, attribute: string) =>
	[...root.querySelectorAll(`[${attribute}]`)].map((li) => li.textContent);
const press = (root: ParentNode, button: string) =>
	root.querySelector<HTMLElement>(`[data-${button}]`)!.click();
const picked = (root: ParentNode) => root.querySelector('[data-picked]')!.textContent;

async function uses(root: ParentNode) {
	expect(rows(root, 'data-person')).toEqual(['Adapick', 'Bopick']);
	expect(rows(root, 'data-tags')).toEqual(['taggedmath', 'plain']);
	// One spelling, three places: the first item field of a pair, an object's field, and an inner loop's item.
	expect(rows(root, 'data-pair')).toEqual(['x:pair-x']);
	expect(rows(root, 'data-group-name')).toEqual(['g1/']);
	expect(rows(root, 'data-kid')).toEqual(['k1', 'k2']);
	expect(rows(root, 'data-owner')).toEqual(['inner']);
	press(root, 'echo');
	await expect.poll(() => rows(root, 'data-echo')).toEqual(['inner']);
	press(root, 'kid="k2"');
	await expect.poll(() => picked(root)).toBe('k2');
	press(root, 'pick="bo"');
	await expect.poll(() => picked(root)).toBe('Bo');
	press(root, 'add');
	await expect.poll(() => rows(root, 'data-person')).toEqual(['Adapick', 'Bopick', 'Cypick']);
	press(root, 'pick="cy"');
	await expect.poll(() => picked(root)).toBe('Cy');
}

test('CSR: destructured names in props, handlers, branches and nested loops', async () => {
	await uses((await render(Uses)).container);
});

test('SSR: destructured names in props, handlers, branches and nested loops', async () => {
	await uses((await renderSSR(Uses)).container);
});
