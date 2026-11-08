import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import TodoApp from './todo-app.tsrx';
import { configureSave, resetSaveApi, saveCalls, ssrCallCount, toggleCalls } from './save-api.ts';

beforeEach(resetSaveApi);
afterEach(() => cleanup());

const LOADS = { timeout: 5_000 };

function submit(container: HTMLElement, title: string) {
	const input = container.querySelector('[data-title]') as HTMLInputElement;
	input.value = title;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
}

test('CSR: a draft shows immediately, then swaps in place to the confirmed row', async () => {
	// A wide delay keeps the optimistic frame observable past this file's first-interaction module load.
	configureSave('Buy milk', { delayMs: 300 });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Buy milk');

	await expect
		.poll(() => container.querySelector('[data-saving-row] [data-optimistic]')?.textContent, LOADS)
		.toBe('Buy milk');
	const draftRow = container.querySelector('[data-saving-row]') as HTMLElement;
	const id = draftRow.getAttribute('data-id')!;
	expect(id).toBeTruthy();

	await expect
		.poll(() => container.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS)
		.toBe('Buy milk');
	// Identity kept: the same <li> element swapped its arm in place.
	expect(container.querySelector(`[data-id="${id}"]`)).toBe(draftRow);
	expect(saveCalls(id)).toHaveLength(1);
});

test('CSR: a failed save shows @catch scoped to that item; reset retries only that save', async () => {
	configureSave('Call Ada', { delayMs: 60, fail: true });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Call Ada');

	await expect.poll(() => container.querySelector('[data-saving-row] [data-failed]')?.textContent, LOADS).toContain(
		"couldn't save",
	);
	const draftRow = container.querySelector('[data-saving-row]') as HTMLElement;
	const id = draftRow.getAttribute('data-id')!;
	expect(container.querySelector(`[data-id="${id}"] [data-confirmed]`)).toBeNull();

	configureSave(id, { delayMs: 30, fail: false });
	container.querySelector<HTMLButtonElement>(`[data-id="${id}"] [data-retry]`)!.click();

	await expect
		.poll(() => container.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS)
		.toBe('Call Ada');
	expect(saveCalls(id)).toHaveLength(2);
});

test('CSR: two concurrent adds, the first fails and the second succeeds, independently', async () => {
	configureSave('Will fail', { delayMs: 60, fail: true });
	configureSave('Will succeed', { delayMs: 20, fail: false });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Will fail');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(1);
	const failId = (container.querySelectorAll('[data-saving-row]')[0] as HTMLElement).getAttribute('data-id')!;

	submit(container, 'Will succeed');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(2);
	const okId = (container.querySelectorAll('[data-saving-row]')[1] as HTMLElement).getAttribute('data-id')!;

	await expect.poll(() => container.querySelector(`[data-id="${okId}"] [data-confirmed]`)?.textContent, LOADS).toBe(
		'Will succeed',
	);
	await expect.poll(() => container.querySelector(`[data-id="${failId}"] [data-failed]`)?.textContent, LOADS)
		.toContain("couldn't save");
	expect(container.querySelector(`[data-id="${okId}"] [data-failed]`)).toBeNull();
	expect(container.querySelector(`[data-id="${failId}"] [data-confirmed]`)).toBeNull();
});

test('CSR: a slow first save finishes after a fast second one; each row settles independently', async () => {
	configureSave('Slow one', { delayMs: 250 });
	configureSave('Fast one', { delayMs: 15 });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Slow one');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(1);
	const slowId = (container.querySelectorAll('[data-saving-row]')[0] as HTMLElement).getAttribute('data-id')!;

	submit(container, 'Fast one');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(2);
	const fastId = (container.querySelectorAll('[data-saving-row]')[1] as HTMLElement).getAttribute('data-id')!;

	await expect.poll(() => container.querySelector(`[data-id="${fastId}"] [data-confirmed]`)?.textContent, LOADS)
		.toBe('Fast one');
	// The slow row is still a draft while the fast one has already confirmed.
	expect(container.querySelector(`[data-id="${slowId}"] [data-optimistic]`)?.textContent).toBe('Slow one');

	await expect.poll(() => container.querySelector(`[data-id="${slowId}"] [data-confirmed]`)?.textContent, LOADS)
		.toBe('Slow one');
});

test('CSR: a parent reload never shows a saved item twice (dedup by client id)', async () => {
	configureSave('Pay rent', { delayMs: 20 });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Pay rent');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(1);
	const id = (container.querySelector('[data-saving-row]') as HTMLElement).getAttribute('data-id')!;

	await expect.poll(() => container.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS).toBe(
		'Pay rent',
	);
	container.querySelector<HTMLButtonElement>('[data-reload]')!.click();

	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(2);
	expect(container.querySelectorAll(`[data-id="${id}"]`)).toHaveLength(1);
});

test('CSR: editing an existing item (toggle done) uses the busy-hold rule, not the optimistic-draft rule', async () => {
	// Toggling a confirmed row re-settles settled content (spec D8), so it holds busy and never shows the row's @pending.
	configureSave('seed-1', { delayMs: 150 });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelector('[data-editing-row] [data-confirmed]')?.textContent, LOADS)
		.toContain('open');

	const samples: boolean[] = [];
	const observer = new MutationObserver(() =>
		samples.push(!!container.querySelector('[data-editing-row][aria-busy="true"], [data-editing-row] [aria-busy="true"]')),
	);
	observer.observe(container, { attributes: true, subtree: true });
	container.querySelector<HTMLButtonElement>('[data-editing-row] [data-toggle]')!.click();

	await expect.poll(() => container.querySelector('[data-editing-row] [data-confirmed]')?.textContent, LOADS)
		.toContain('done');
	observer.disconnect();
	expect(container.querySelector('[data-editing-row] [data-optimistic]')).toBeNull();
	expect(samples.some(Boolean), 'the held old content was marked busy during the toggle').toBe(true);
	expect(toggleCalls('seed-1')).toHaveLength(1);
});

test('no aria-busy anywhere during a draft\'s optimistic window (a first run is not a refresh)', async () => {
	configureSave('Watched add', { delayMs: 150 });
	const screen = await render(TodoApp);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	const samples: boolean[] = [];
	const observer = new MutationObserver(() => samples.push(!!container.querySelector('[aria-busy="true"]')));
	observer.observe(container, { attributes: true, attributeFilter: ['aria-busy'], subtree: true });
	submit(container, 'Watched add');
	await expect.poll(() => container.querySelector('[data-saving-row] [data-confirmed]')?.textContent, LOADS).toBe(
		'Watched add',
	);
	observer.disconnect();
	expect(samples.every((busy) => busy === false)).toBe(true);
	expect(container.querySelector('[aria-busy="true"]')).toBeNull();
});

test('side-effect rule: the save never runs during server rendering, and runs exactly once for one creation', async () => {
	resetSaveApi();
	configureSave('Resumed add', { delayMs: 60 });
	const screen = await renderSSR(TodoApp);
	const container = screen.container as HTMLElement;
	expect(ssrCallCount(), 'no save ran while building the SSR HTML').toBe(0);

	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);
	submit(container, 'Resumed add');
	await expect.poll(() => container.querySelectorAll('[data-saving-row]').length, LOADS).toBe(1);
	const id = (container.querySelector('[data-saving-row]') as HTMLElement).getAttribute('data-id')!;

	await expect.poll(() => container.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS).toBe(
		'Resumed add',
	);
	expect(ssrCallCount(), 'still no server-side save after the row resolved in the browser').toBe(0);
	expect(saveCalls(id)).toHaveLength(1);
});

test('SSR: the served HTML carries no draft row', async () => {
	resetSaveApi();
	const screen = await renderSSR(TodoApp);
	expect((screen.container as HTMLElement).querySelector('[data-saving-row]')).toBeNull();
});
