import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-callback-slot/page.tsrx';
import Shapes from './row-callback-slot/shapes.tsrx';

// A family root in a @for row fills its callback slot with the row's own arrow; the trigger's dispatch runs it as the composer's, reading that row.
afterEach(() => cleanup());

type Root = ParentNode;
const text = (root: Root, selector: string) => root.querySelector(selector)?.textContent;
const click = (root: Root, selector: string) => root.querySelector<HTMLElement>(selector)!.click();

async function collapsibleRowsRunTheAppCallback(root: Root) {
	click(root, '[data-trigger="bread"]');
	await expect.poll(() => text(root, '[data-last]')).toBe('bread:true');
	expect(text(root, '[data-opened]')).toBe('1');
	click(root, '[data-trigger="milk"]');
	await expect.poll(() => text(root, '[data-last]')).toBe('milk:true');
	expect(text(root, '[data-opened]')).toBe('2');
}

async function toggleRowsRunTheAppCallback(root: Root) {
	click(root, '[data-flip="y2"]');
	await expect.poll(() => text(root, '[data-flipped]')).toBe('y2:true');
	click(root, '[data-flip="x1"]');
	await expect.poll(() => text(root, '[data-flipped]')).toBe('x1:true');
}

async function tabsRowsRunTheAppCallback(root: Root) {
	click(root, '[data-pane="four"]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('right>four');
	click(root, '[data-pane="two"]');
	await expect.poll(() => text(root, '[data-shown]')).toBe('left>two');
}

async function componentRowsWriteTheirOwnInstance(root: Root) {
	click(root, '[data-bin="d"]');
	await expect.poll(() => text(root, '[data-picked="south"]')).toBe('south/d=true');
	expect(text(root, '[data-picked="north"]')).toBe('-');
	click(root, '[data-bin="a"]');
	await expect.poll(() => text(root, '[data-picked="north"]')).toBe('north/a=true');
	expect(text(root, '[data-picked="south"]')).toBe('south/d=true');
}

async function quietly(run: () => Promise<void>) {
	const errors = vi.spyOn(console, 'error');
	await run();
	expect(errors).not.toHaveBeenCalled();
}

test('CSR: a collapsible root in a page @for row runs the app callback its slot holds', () =>
	quietly(async () => collapsibleRowsRunTheAppCallback((await render(Page)).container)));

test('SSR: a collapsible root in a page @for row runs the app callback its slot holds', () =>
	quietly(async () => collapsibleRowsRunTheAppCallback((await renderSSR(Page)).container)));

test('CSR: a toggle root in a page @for row runs the app callback its slot holds', () =>
	quietly(async () => toggleRowsRunTheAppCallback((await render(Shapes)).container)));

test('SSR: a toggle root in a page @for row runs the app callback its slot holds', () =>
	quietly(async () => toggleRowsRunTheAppCallback((await renderSSR(Shapes)).container)));

test('CSR: a tabs root in a page @for row runs the app callback from a trigger in a nested @for', () =>
	quietly(async () => tabsRowsRunTheAppCallback((await render(Shapes)).container)));

test('SSR: a tabs root in a page @for row runs the app callback from a trigger in a nested @for', () =>
	quietly(async () => tabsRowsRunTheAppCallback((await renderSSR(Shapes)).container)));

test('CSR: a toggle root in a component row writes that component instance', () =>
	quietly(async () => componentRowsWriteTheirOwnInstance((await render(Shapes)).container)));

test('SSR: a toggle root in a component row writes that component instance', () =>
	quietly(async () => componentRowsWriteTheirOwnInstance((await renderSSR(Shapes)).container)));
