import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import KeyedBoundRows from './fixtures/keyed-rows-served-empty-arm.tsrx';

// A list served empty paints its @empty arm with no markers; rows with bound attributes must still replace it.
afterEach(() => cleanup());

function click(container: ParentNode, selector: string) {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function expectKeyedBoundRows(container: HTMLElement) {
	expect(container.querySelector('[data-empty]')).not.toBeNull();
	click(container, '[data-add]');
	await expect.poll(() => container.querySelectorAll('[data-row]').length).toBe(1);
	click(container, '[data-add]');
	await expect.poll(() => container.querySelectorAll('[data-row]').length).toBe(2);
	expect(container.querySelector('[data-empty]')).toBeNull();
	const rows = [...container.querySelectorAll('[data-row]')].map((row) => [
		row.id,
		row.className,
		row.getAttribute('data-row'),
		row.textContent,
	]);
	expect(rows).toEqual([
		['row-1', 'row', '1', 'item 1'],
		['row-2', 'row', '2', 'item 2'],
	]);
	const order = () =>
		[...container.querySelectorAll('ul > li')].map((li) => li.textContent).join(',');
	expect(order()).toBe('head,item 1,item 2,tail');

	click(container, '[data-clear]');
	await expect.poll(order).toBe('head,none,tail');
	click(container, '[data-add]');
	await expect.poll(order).toBe('head,item 3,tail');
	expect(container.querySelector('[data-row]')?.id).toBe('row-3');
}

test('CSR: keyed @for rows with bound attributes render as items are added', async () => {
	const screen = await render(KeyedBoundRows);
	await expectKeyedBoundRows(screen.container as HTMLElement);
});

test('SSR: keyed @for rows with bound attributes render as items are added', async () => {
	const screen = await renderSSR(KeyedBoundRows);
	await expectKeyedBoundRows(screen.container as HTMLElement);
});
