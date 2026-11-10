import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import TanstackOptimisticUpdatesPort from './tanstack-port.tsrx';
import { configureSave, resetSaveApi } from './save-api.ts';

beforeEach(resetSaveApi);
afterEach(() => cleanup());

const LOADS = { timeout: 5_000 };

function submit(container: HTMLElement, title: string) {
	const input = container.querySelector('[data-text]') as HTMLInputElement;
	input.value = title;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	container.querySelector<HTMLButtonElement>('[data-add]')!.click();
}

test('TanStack optimistic-updates (via the UI) port: success path dims then confirms', async () => {
	configureSave('Buy milk', { delayMs: 200 });
	const screen = await render(TanstackOptimisticUpdatesPort);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Buy milk');
	await expect.poll(() => container.querySelector('[data-optimistic]')?.textContent, LOADS).toBe('Buy milk');
	const added = container.querySelector('[data-optimistic]') as HTMLElement;
	expect(added.getAttribute('style')).toContain('opacity: 0.5');

	await expect.poll(() => container.querySelectorAll('[data-confirmed]').length, LOADS).toBe(2);
	expect(container.querySelector('[data-optimistic]')).toBeNull();
});

test('TanStack optimistic-updates (via the UI) port: error path shows red with a working retry', async () => {
	configureSave('Will fail once', { delayMs: 60, fail: true });
	const screen = await render(TanstackOptimisticUpdatesPort);
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-row]').length, LOADS).toBe(1);

	submit(container, 'Will fail once');
	await expect.poll(() => container.querySelector('[data-row][data-id] [data-failed]')?.textContent, LOADS)
		.toContain('Will fail once');
	const draftLi = container.querySelector('[data-row][data-id]') as HTMLElement;
	const id = draftLi.getAttribute('data-id')!;
	expect(container.querySelector(`[data-id="${id}"] [data-failed]`)?.getAttribute('style')).toContain('color: red');

	configureSave(id, { delayMs: 20, fail: false });
	container.querySelector<HTMLButtonElement>(`[data-id="${id}"] [data-retry]`)!.click();

	await expect
		.poll(() => container.querySelector(`[data-id="${id}"] [data-confirmed]`)?.textContent, LOADS)
		.toBe('Will fail once');
});
