import { expect, test } from 'vitest';
import { render, renderSSR } from '../src/index.ts';
import PageHead from './async-arm-text-in-place/page-head.tsrx';
import ChildUnderIf from './async-arm-text-in-place/child-under-if.tsrx';

// Text in a @try arm refreshes its own text node: arm elements keep identity and focus, and surrounding anchors stay put.

function click(container: HTMLElement, selector: string) {
	const element = container.querySelector<HTMLElement>(selector);
	if (!element) throw new Error(`Expected "${selector}" in the rendered DOM.`);
	element.click();
}

const textOf = (host: Element | null) =>
	Array.from(host?.childNodes ?? []).find((node) => node.nodeType === 3 && node.nodeValue?.trim());

async function inPlace(container: HTMLElement, shape: { host: string; field: string; refresh: string; text: RegExp }) {
	await expect.poll(() => container.querySelector(shape.field)).not.toBeNull();
	const host = container.querySelector(shape.host)!;
	const field = container.querySelector<HTMLElement>(shape.field)!;
	const text = textOf(host)!;
	const before = text.nodeValue;
	const siblings = Array.from(host.childNodes).filter((node) => node.nodeType !== 3);
	expect(before).toMatch(shape.text);
	field.focus();
	click(container, shape.refresh);
	await expect.poll(() => textOf(host)?.nodeValue).not.toBe(before);
	expect(textOf(host)).toBe(text);
	expect(text.nodeValue).toMatch(shape.text);
	expect(container.querySelector(shape.field)).toBe(field);
	expect(document.activeElement).toBe(field);
	expect(Array.from(host.childNodes).filter((node) => node.nodeType !== 3)).toEqual(siblings);
}

const head = { host: '.head', field: 'input[data-field]', refresh: 'button[data-refresh]', text: /^Editing "todo-1" #\d+$/ };
const note = { host: 'header.note', field: 'textarea[data-body]', refresh: 'button[data-bump]', text: /^\s*ALPHA saved \d+ times\s*$/ };

test('CSR: page @try text beside an element in the arm refreshes in place', async () => {
	await inPlace((await render(PageHead)).container as HTMLElement, head);
});

test('SSR: page @try text beside an element in the arm refreshes in place', async () => {
	await inPlace((await renderSSR(PageHead)).container as HTMLElement, head);
});

async function noteCycle(container: HTMLElement) {
	click(container, 'button[data-show]');
	await inPlace(container, note);
	// The @if before the @try changes how many nodes precede the arm; the text still lands in its own node.
	click(container, 'button[data-unpin]');
	await expect.poll(() => container.querySelector('header.note em')).toBeNull();
	await inPlace(container, note);
	expect(container.querySelector('header.note a[data-top]')?.textContent).toBe('Top');
}

test('CSR: a child under a page @if refreshes its @try text in place past a changing @if', async () => {
	await noteCycle((await render(ChildUnderIf)).container as HTMLElement);
});

test('SSR: a child under a page @if refreshes its @try text in place past a changing @if', async () => {
	await noteCycle((await renderSSR(ChildUnderIf)).container as HTMLElement);
});
