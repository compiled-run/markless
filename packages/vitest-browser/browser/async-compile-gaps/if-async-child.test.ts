import { expect, test } from 'vitest';
import { render, renderSSR } from '../../src/index.ts';
import IfAsyncChildEdit from './if-async-child-edit.tsrx';
import IfAsyncChildPlain from './if-async-child-plain.tsrx';
import IfChildBoundDerive from './if-child-bound-derive.tsrx';

// An @if holding a same-file child with its own async value builds, and each flip renders and settles the child.

function click(container: HTMLElement, selector: string) {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

async function editCycle(container: HTMLElement) {
	expect(container.querySelector('.edit')).toBeNull();
	click(container, 'button[data-open-one]');
	await expect.poll(() => container.querySelector('[data-edit-name]')?.textContent).toBe('todo-1');
	expect(container.querySelector('main hr')).not.toBeNull();
	click(container, 'button[data-close]');
	await expect.poll(() => container.querySelector('.edit')).toBeNull();
	expect(container.querySelector('main hr')).toBeNull();
	click(container, 'button[data-open-two]');
	await expect.poll(() => container.querySelector('[data-edit-name]')?.textContent).toBe('todo-2');
}

async function toggleCycle(container: HTMLElement) {
	expect(container.querySelector('[data-greeting]')).toBeNull();
	click(container, 'button[data-toggle]');
	await expect.poll(() => container.querySelector('[data-line]')?.textContent).toBe('hello sam');
	click(container, 'button[data-toggle]');
	await expect.poll(() => container.querySelector('[data-greeting]')).toBeNull();
	click(container, 'button[data-toggle]');
	await expect.poll(() => container.querySelector('[data-line]')?.textContent).toBe('hello sam');
}

test('CSR: an @if holding an edit form with its own async value opens, closes and reopens', async () => {
	const screen = await render(IfAsyncChildEdit);
	await editCycle(screen.container as HTMLElement);
});

test('SSR: an @if holding an edit form with its own async value opens, closes and reopens', async () => {
	const screen = await renderSSR(IfAsyncChildEdit);
	await editCycle(screen.container as HTMLElement);
});

test('CSR: an @if holding a bare component with its own async value toggles', async () => {
	const screen = await render(IfAsyncChildPlain);
	await toggleCycle(screen.container as HTMLElement);
});

test('SSR: an @if holding a bare component with its own async value toggles', async () => {
	const screen = await renderSSR(IfAsyncChildPlain);
	await toggleCycle(screen.container as HTMLElement);
});

async function badgeCycle(container: HTMLElement) {
	click(container, 'button[data-pin]');
	await expect.poll(() => container.querySelector('[data-badge]')?.textContent).toBe('pinned:0');
	click(container, '[data-badge]');
	await expect.poll(() => container.querySelector('[data-badge]')?.textContent).toBe('pinned:1');
	click(container, 'button[data-pin]');
	await expect.poll(() => container.querySelector('[data-badge]')).toBeNull();
	click(container, 'button[data-level]');
	await expect.poll(() => container.querySelector('[data-badge]')?.textContent).toBe('level2:0');
}

test('CSR: an @if in a child of the page flips a component whose derive is bound per edge', async () => {
	const screen = await render(IfChildBoundDerive);
	await badgeCycle(screen.container as HTMLElement);
});

test('SSR: an @if in a child of the page flips a component whose derive is bound per edge', async () => {
	const screen = await renderSSR(IfChildBoundDerive);
	await badgeCycle(screen.container as HTMLElement);
});
