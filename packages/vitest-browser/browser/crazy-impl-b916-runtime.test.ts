import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import AsyncDetails from './fixtures/async-details.tsrx';
import Counter from './fixtures/counter.tsrx';
import DuplicateKeys from './fixtures/crazy-impl-b916-duplicate-keys.tsrx';
import ReorderRows from './fixtures/crazy-impl-b916-reorder-rows.tsrx';
import UndefinedRows from './fixtures/crazy-impl-b916-undefined-rows.tsrx';
import RowsChoose from './fixtures/rows-choose.tsrx';

afterEach(() => cleanup());

function requireElement<T extends Element>(container: HTMLElement, selector: string): T {
	const element = container.querySelector<T>(selector);
	if (!element) throw new Error(`Expected ${selector}.`);
	return element;
}

test('B916: keyed row handlers keep the clicked row local', async () => {
	const screen = await render(RowsChoose);
	const rows = Array.from(screen.container.querySelectorAll('article'));
	const chosen = requireElement<HTMLOutputElement>(screen.container as HTMLElement, 'output[data-chosen]');
	rows[1]?.querySelector<HTMLButtonElement>('button')?.click();
	await expect.poll(() => chosen.textContent).toBe('beta');
});

test('B916: duplicate keyed rows fail loud in CSR and SSR', async () => {
	await expect(render(DuplicateKeys)).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		phase: 'runtime',
		collidingValue: 'fruit',
	});
	await expect(renderSSR(DuplicateKeys)).rejects.toMatchObject({
		code: 'MARKLESS_REPEAT_KEY_DUPLICATE',
		phase: 'runtime',
		collidingValue: 'fruit',
	});
});

test('B916: rows that start undefined recover when data arrives', async () => {
	const screen = await render(UndefinedRows);
	const container = screen.container as HTMLElement;
	expect(container.querySelector('li.empty')?.textContent).toBe('No items yet');

	requireElement<HTMLButtonElement>(container, 'button[data-load]').click();
	await expect.poll(() => Array.from(container.querySelectorAll('li.row')).map((row) => row.textContent)).toEqual([
		'Alpha',
		'Beta',
	]);
	expect(container.querySelector('li.empty')).toBeNull();
});

test('B916: keyed reorder preserves row DOM identity and handler locals', async () => {
	const screen = await render(ReorderRows);
	const container = screen.container as HTMLElement;
	const before = Array.from(container.querySelectorAll('article'));
	const chosen = requireElement<HTMLOutputElement>(container, 'output[data-chosen]');

	requireElement<HTMLButtonElement>(container, 'button[data-reverse]').click();
	await expect.poll(() => Array.from(container.querySelectorAll('h2')).map((heading) => heading.textContent)).toEqual([
		'Gamma',
		'Beta',
		'Alpha',
	]);

	const after = Array.from(container.querySelectorAll('article'));
	expect(after[0]).toBe(before[2]);
	expect(after[1]).toBe(before[1]);
	expect(after[2]).toBe(before[0]);
	after[2]?.querySelector<HTMLButtonElement>('button')?.click();
	await expect.poll(() => chosen.textContent).toBe('alpha');
});

test('B916/B923: cleanup disposes CSR runtime listeners before removing DOM', async () => {
	const screen = await render(Counter);
	const button = requireElement<HTMLButtonElement>(screen.container as HTMLElement, 'button[data-counter]');
	const text = button.firstChild;

	expect(text?.textContent).toBe('0');
	await cleanup();
	button.click();
	await Promise.resolve();
	expect(text?.textContent).toBe('0');
});

test('B923: cleanup after an async boundary leaves the next render isolated', async () => {
	const first = await render(AsyncDetails);
	expect((first.container as HTMLElement).querySelector('p.pending')?.textContent).toBe('Loading');
	await cleanup();

	const second = await render(Counter);
	const button = requireElement<HTMLButtonElement>(second.container as HTMLElement, 'button[data-counter]');
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect(document.querySelector('p.done')).toBeNull();
	button.click();
	await expect.poll(() => button.textContent).toBe('1');
});
