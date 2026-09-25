import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import { App as SameModule } from './fixtures/try-if-flip-component.tsrx';
import { Shelf as Imported } from './fixtures/try-if-flip-imported.tsrx';
import { Ledger } from './fixtures/late-mount-keyed-row.tsrx';
import { Drawer } from './fixtures/late-mount-plain-if.tsrx';
import { Panel } from './fixtures/late-mount-try-if.tsrx';

afterEach(() => cleanup());

function text(container: HTMLElement, selector: string): string | undefined {
	return container.querySelector(selector)?.textContent ?? undefined;
}

function click(container: HTMLElement, selector: string) {
	container.querySelector<HTMLElement>(selector)?.click();
}

async function flipSameModule(container: HTMLElement, clickChild: boolean) {
	await expect.poll(() => text(container, '[data-report-title]')).toBe('Report ready');
	expect(container.querySelector('[data-badge]')).toBeNull();
	click(container, '[data-toggle]');
	await expect.poll(() => text(container, '[data-badge]')).toBe('badge-0');
	if (clickChild) {
		click(container, '[data-badge]');
		await expect.poll(() => text(container, '[data-badge]')).toBe('badge-1');
	}
	click(container, '[data-toggle]');
	await expect.poll(() => container.querySelector('[data-badge]')).toBeNull();
	expect(text(container, '[data-report-title]')).toBe('Report ready');
}

async function flipImported(container: HTMLElement, clickChild: boolean) {
	await expect.poll(() => text(container, '[data-stock-name]')).toBe('Shelf stocked 1');
	expect(container.querySelector('[data-counter]')).toBeNull();
	click(container, '[data-reveal]');
	await expect.poll(() => text(container, '[data-counter]')).toBe('3 boxes');
	if (clickChild) {
		click(container, '[data-counter]');
		await expect.poll(() => text(container, '[data-counter]')).toBe('4 boxes');
	}
	const shown = clickChild ? '4 boxes' : '3 boxes';
	click(container, '[data-restock]');
	await expect.poll(() => text(container, '[data-stock-name]')).toBe('Shelf stocked 2');
	expect(text(container, '[data-counter]')).toBe(shown);
	click(container, '[data-reveal]');
	await expect.poll(() => container.querySelector('[data-counter]')).toBeNull();
	click(container, '[data-reveal]');
	await expect.poll(() => text(container, '[data-counter]')).toBe('3 boxes');
	expect(text(container, '[data-stock-name]')).toBe('Shelf stocked 2');
}

test('client render: an @if inside @try mounts a same-module stateful child', async () => {
	const screen = await render(SameModule);
	await flipSameModule(screen.container as HTMLElement, true);
});

test('client render: an @if inside @try mounts an imported stateful child', async () => {
	const screen = await render(Imported);
	await flipImported(screen.container as HTMLElement, true);
});

test('SSR: an @if inside @try mounts a same-module stateful child', async () => {
	const screen = await renderSSR(SameModule);
	await flipSameModule(screen.container as HTMLElement, false);
});

test('SSR: an @if inside @try mounts an imported stateful child', async () => {
	const screen = await renderSSR(Imported);
	await flipImported(screen.container as HTMLElement, true);
});

test('SSR: a child an @if inside @try mounts after resume takes clicks', async () => {
	const screen = await renderSSR(SameModule);
	await flipSameModule(screen.container as HTMLElement, true);
});

function doubleClick(container: HTMLElement, selector: string) {
	container
		.querySelector<HTMLElement>(selector)
		?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
}

async function tapLateChip(container: HTMLElement) {
	expect(container.querySelector('[data-chip]')).toBeNull();
	click(container, '[data-open]');
	await expect.poll(() => text(container, '[data-chip]')).toBe('chip 0/0');
	click(container, '[data-chip]');
	await expect.poll(() => text(container, '[data-chip]')).toBe('chip 1/0');
	doubleClick(container, '[data-chip]');
	await expect.poll(() => text(container, '[data-chip]')).toBe('chip 1/1');
}

test('SSR: a child an @if inside @try mounts after resume takes an event type the served page never listed', async () => {
	const screen = await renderSSR(Panel);
	const container = screen.container as HTMLElement;
	await expect.poll(() => text(container, '[data-summary]')).toBe('Summary loaded');
	await tapLateChip(container);
});

test('SSR: a child a plain @if mounts after resume takes clicks and other event types', async () => {
	const screen = await renderSSR(Drawer);
	await tapLateChip(screen.container as HTMLElement);
});

test('SSR: a keyed @for row minted after resume takes clicks and other event types', async () => {
	const screen = await renderSSR(Ledger);
	const container = screen.container as HTMLElement;
	click(container, '[data-add]');
	await expect.poll(() => text(container, '[data-row="2"]')).toBe('row 2 0/0');
	click(container, '[data-row="2"]');
	await expect.poll(() => text(container, '[data-row="2"]')).toBe('row 2 1/0');
	doubleClick(container, '[data-row="2"]');
	await expect.poll(() => text(container, '[data-row="2"]')).toBe('row 2 1/1');
	expect(text(container, '[data-row="1"]')).toBe('row 1 0/0');
});
