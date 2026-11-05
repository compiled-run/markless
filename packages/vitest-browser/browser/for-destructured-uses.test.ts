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
