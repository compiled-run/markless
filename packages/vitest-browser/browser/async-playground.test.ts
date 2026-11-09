import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import IfSyncDeriveOne from './async-playground/if-sync-derive-one.tsrx';
import IfSyncDeriveTwo from './async-playground/if-sync-derive-two.tsrx';
import IfSyncDeriveThree from './async-playground/if-sync-derive-three.tsrx';
import RowsCatchOne from './async-playground/rows-catch-one.tsrx';
import RowsCatchTwo from './async-playground/rows-catch-two.tsrx';
import RowsCatchThree from './async-playground/rows-catch-three.tsrx';
import ArmTextOne from './async-playground/arm-text-one.tsrx';
import ArmTextTwo from './async-playground/arm-text-two.tsrx';
import ArmTextThree from './async-playground/arm-text-three.tsrx';
import { userEvent } from 'vitest/browser';

// The converted TanStack Query playground's shapes, at one to three components deep.

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

const lists = (container: HTMLElement) =>
	[...container.querySelectorAll('.list ul')].map((list) => [...list.querySelectorAll('li')].map((item) => item.textContent));

async function rowsCycle(container: HTMLElement) {
	await expect.poll(() => lists(container)).toEqual([['apple', 'banana', 'grape'], ['banana'], ['grape']]);
	const first = container.querySelector<HTMLInputElement>('.list input')!;
	await userEvent.fill(first, 'pp');
	await expect.poll(() => lists(container)[0]).toEqual(['apple']);
	await userEvent.fill(first, 'boom');
	await expect.poll(() => container.querySelector('.list [data-error]')?.textContent).toContain('no items');
	expect(lists(container).slice(-2)).toEqual([['banana'], ['grape']]);
}

test("CSR: rows of the page whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await render(RowsCatchOne)).container as HTMLElement);
});

test("SSR: rows of the page whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await renderSSR(RowsCatchOne)).container as HTMLElement);
});

test("CSR: rows in the page's child whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await render(RowsCatchTwo)).container as HTMLElement);
});

test("SSR: rows in the page's child whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await renderSSR(RowsCatchTwo)).container as HTMLElement);
});

test("CSR: rows two components below the page whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await render(RowsCatchThree)).container as HTMLElement);
});

test("SSR: rows two components below the page whose @try has a @catch settle, refresh and fail", async () => {
	await rowsCycle((await renderSSR(RowsCatchThree)).container as HTMLElement);
});

const head = (container: HTMLElement) => container.querySelector('.edit .head')?.textContent?.replace(/\s+/g, ' ').trim();

async function armTextCycle(container: HTMLElement) {
	click(container, 'button[data-open]');
	await expect.poll(() => container.querySelector('[data-edit-name]')?.textContent).toBe('todo-1');
	const shown = head(container);
	expect(shown).toMatch(/^Editing "todo-1" #\d+Back$/);
	click(container, 'button[data-refresh]');
	await expect.poll(() => head(container)).not.toBe(shown);
	expect(head(container)).toMatch(/^Editing "todo-1" #\d+Back$/);
}

test("CSR: a @try arm of bare text under a page @if renders beside its sibling and refreshes", async () => {
	await armTextCycle((await render(ArmTextOne)).container as HTMLElement);
});

test("SSR: a @try arm of bare text under a page @if renders beside its sibling and refreshes", async () => {
	await armTextCycle((await renderSSR(ArmTextOne)).container as HTMLElement);
});

test("CSR: a @try arm of bare text under an @if in the page's child renders beside its sibling and refreshes", async () => {
	await armTextCycle((await render(ArmTextTwo)).container as HTMLElement);
});

test("SSR: a @try arm of bare text under an @if in the page's child renders beside its sibling and refreshes", async () => {
	await armTextCycle((await renderSSR(ArmTextTwo)).container as HTMLElement);
});

test("CSR: a @try arm of bare text two components below the page renders beside its sibling and refreshes", async () => {
	await armTextCycle((await render(ArmTextThree)).container as HTMLElement);
});

test("SSR: a @try arm of bare text two components below the page renders beside its sibling and refreshes", async () => {
	await armTextCycle((await renderSSR(ArmTextThree)).container as HTMLElement);
});
