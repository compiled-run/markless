import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import IfSyncDeriveOne from './async-playground/if-sync-derive-one.tsrx';
import IfSyncDeriveTwo from './async-playground/if-sync-derive-two.tsrx';
import IfSyncDeriveThree from './async-playground/if-sync-derive-three.tsrx';

// An @if arm holding a component with a sync computed over its own state renders and keeps that value live.

function click(container: HTMLElement, selector: string) {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

const save = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('button[data-save]');

async function editCycle(container: HTMLElement) {
	click(container, 'button[data-open-one]');
	await expect.poll(() => container.querySelector('[data-edit-name]')?.textContent).toBe('todo-1');
	expect(save(container)?.disabled).toBe(false);
	click(container, 'button[data-save]');
	await expect.poll(() => save(container)?.disabled).toBe(true);
	click(container, 'button[data-unlock]');
	await expect.poll(() => save(container)?.disabled).toBe(false);
	click(container, 'button[data-close]');
	await expect.poll(() => container.querySelector('.edit')).toBeNull();
	click(container, 'button[data-open-two]');
	await expect.poll(() => container.querySelector('[data-edit-name]')?.textContent).toBe('todo-2');
	expect(save(container)?.disabled).toBe(false);
	click(container, 'button[data-save]');
	await expect.poll(() => save(container)?.disabled).toBe(true);
}

test("CSR: an @if in the page holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await render(IfSyncDeriveOne)).container as HTMLElement);
});

test("SSR: an @if in the page holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await renderSSR(IfSyncDeriveOne)).container as HTMLElement);
});

test("CSR: an @if in the page's child holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await render(IfSyncDeriveTwo)).container as HTMLElement);
});

test("SSR: an @if in the page's child holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await renderSSR(IfSyncDeriveTwo)).container as HTMLElement);
});

test("CSR: an @if two components below the page holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await render(IfSyncDeriveThree)).container as HTMLElement);
});

test("SSR: an @if two components below the page holding a component with a sync computed opens, updates and reopens", async () => {
	await editCycle((await renderSSR(IfSyncDeriveThree)).container as HTMLElement);
});
