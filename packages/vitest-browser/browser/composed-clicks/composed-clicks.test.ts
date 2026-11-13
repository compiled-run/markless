import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Board from './board.tsrx';
import ComposedBoard from './composed-board.tsrx';
import ComposedCounterBoard from './composed-counter-board.tsrx';
import { resetNotes } from './notes-api.ts';
import TwiceComposedBoard from './twice-composed-board.tsrx';

// A page that mounts its app as a child component: row handlers, a row-local @if and a form beside a @try list respond.
beforeEach(() => resetNotes());
afterEach(() => cleanup());

const poll = { timeout: 5_000, interval: 10 };
type Screen = { readonly container: unknown };

function row(container: HTMLElement, id: string): HTMLElement {
	const found = container.querySelector<HTMLElement>(`[data-note="${id}"]`);
	if (!found) throw new Error(`Expected row ${id} in the rendered DOM.`);
	return found;
}

function press(container: HTMLElement, selector: string) {
	const button = container.querySelector<HTMLButtonElement>(selector);
	if (!button) throw new Error(`Expected ${selector} in the rendered DOM.`);
	button.click();
}

async function boardResponds(screen: Screen) {
	const container = screen.container as HTMLElement;
	await expect.poll(() => container.querySelectorAll('[data-note]').length, poll).toBe(2);
	press(row(container, 'b'), '[data-like]');
	await expect
		.poll(() => row(container, 'b').querySelector('[data-likes]')?.textContent, poll)
		.toBe('5');
	press(row(container, 'a'), '[data-expand]');
	await expect
		.poll(() => row(container, 'a').querySelector('[data-details]'), poll)
		.not.toBeNull();
	expect(row(container, 'b').querySelector('[data-details]')).toBeNull();
	const draft = container.querySelector<HTMLInputElement>('[data-draft]')!;
	draft.value = 'Street party';
	draft.dispatchEvent(new Event('input', { bubbles: true }));
	press(container, '[data-post]');
	await expect.poll(() => container.querySelectorAll('[data-note]').length, poll).toBe(3);
	expect(row(container, 'n2').querySelector('[data-title]')?.textContent).toBe('Street party');
	expect(row(container, 'a').querySelector('[data-details]')).not.toBeNull();
}

test('client-rendered mounted directly: row clicks, a row @if and the add form respond', async () => {
	const screen = await render(Board);
	await boardResponds(screen);
});

test('server-rendered and resumed mounted directly: row clicks, a row @if and the add form respond', async () => {
	const screen = await renderSSR(Board);
	await boardResponds(screen);
});

test('server-rendered and resumed inside another component: row clicks, a row @if and the add form respond', async () => {
	const screen = await renderSSR(ComposedBoard);
	await boardResponds(screen);
});

test('server-rendered and resumed two components deep: row clicks, a row @if and the add form respond', async () => {
	const screen = await renderSSR(TwiceComposedBoard);
	await boardResponds(screen);
});

test('client-rendered inside another component: row handlers without an @if respond', async () => {
	const { container } = await render(ComposedCounterBoard);
	const page = container as HTMLElement;
	await expect.poll(() => page.querySelectorAll('[data-note]').length, poll).toBe(2);
	press(row(page, 'a'), '[data-tap]');
	await expect
		.poll(() => row(page, 'a').querySelector('[data-taps]')?.textContent, poll)
		.toBe('1');
	press(row(page, 'b'), '[data-like]');
	await expect
		.poll(() => row(page, 'b').querySelector('[data-likes]')?.textContent, poll)
		.toBe('5');
	expect(row(page, 'b').querySelector('[data-taps]')?.textContent).toBe('0');
});

// The rows are on the page a few tasks before the rest of their arm is wired; a press in that window must still reach its row's item.
test('client-rendered: a like pressed the moment the rows appear reaches its own row', async () => {
	const warm = (await render(Board)).container as HTMLElement;
	await expect.poll(() => warm.querySelectorAll('[data-note]').length, poll).toBe(2);
	await cleanup();
	resetNotes();
	const pressed = pressOnArrival(document.body, '[data-note="b"] [data-like]');
	const container = (await render(Board)).container as HTMLElement;
	await pressed;
	await expect
		.poll(() => row(container, 'b').querySelector('[data-likes]')?.textContent, poll)
		.toBe('5');
});

// Presses the element in the observer callback that first sees it, before any later task runs.
function pressOnArrival(root: Node, selector: string): Promise<void> {
	return new Promise((resolve) => {
		const observer = new MutationObserver(() => {
			const element = (root as ParentNode).querySelector<HTMLElement>(selector);
			if (!element) return;
			observer.disconnect();
			element.click();
			resolve();
		});
		observer.observe(root, { childList: true, subtree: true });
	});
}
