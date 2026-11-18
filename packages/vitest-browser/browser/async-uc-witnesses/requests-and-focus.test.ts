import { afterEach, beforeEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import { answer, asked, fail, hold, release, reset } from '../matched-values/gates.ts';
import { FocusKeep } from './focus-keep.tsrx';
import { SameRequest } from './same-request.tsrx';
import { each, poll, text, underBusy } from './support.ts';

// Witnesses for request sharing on one page and for focus, selection and scroll through a refresh.
const realFetch = globalThis.fetch;
const requests: string[] = [];

beforeEach(() => {
	requests.length = 0;
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = String(input);
		requests.push(url);
		const currency = new URL(url, location.href).searchParams.get('currency');
		await answer(url, null);
		return new Response(JSON.stringify({ value: currency === 'USD' ? 1.1 : 1 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = realFetch;
	reset();
	cleanup();
});

const rateUrl = (currency: string) => `/api/rate?currency=${currency}`;

// The server render has no browser fetch to count, so only the client-rendered page is checked.
// Gap: each async value sends its own request, so two values and two child instances asking one URL send four.
test.fails('identical requests from one page go out once (client-rendered)', async () => {
	hold(rateUrl('EUR'));
	const container = (await render(SameRequest)).container as HTMLElement;
	await expect.poll(() => requests.length, poll).toBeGreaterThan(0);
	release(rateUrl('EUR'));
	await expect.poll(() => text(container, '[data-price]'), poll).toBe('1');
	await expect.poll(() => text(container, '[data-tax]'), poll).toBe('1');
	await expect.poll(() => [...container.querySelectorAll('[data-badge] b')].map((b) => b.textContent).join(','), poll).toBe('1,1');
	expect(requests, 'requests sent for one URL with the same inputs').toEqual([rateUrl('EUR')]);
});

type Outcome = 'lands' | 'fails';

function finish(container: HTMLElement, query: string, outcome: Outcome) {
	if (outcome === 'lands') {
		release(`results:${query}`);
		return expect.poll(() => text(container, '[data-row="r0"] button'), poll).toBe(`${query}r0`);
	}
	fail(`results:${query}`, 'Search failed');
	return expect.poll(() => text(container, '[data-failed]'), poll).toBe('Search failed');
}

function typeInto(input: HTMLInputElement, value: string, selection?: readonly [number, number]) {
	input.value = value;
	if (selection) input.setSelectionRange(...selection);
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function caretKept(container: HTMLElement, outcome: Outcome) {
	await expect.poll(() => text(container, '[data-row="r0"] button'), poll).toBe('r0');
	const input = container.querySelector<HTMLInputElement>('[data-query]')!;
	input.focus();
	hold('results:abc');
	typeInto(input, 'abc', [1, 2]);
	await expect.poll(() => asked.includes('results:abc'), poll).toBe(true);
	await finish(container, 'abc', outcome);
	expect(container.querySelector('[data-query]'), 'the input was replaced').toBe(input);
	expect(document.activeElement, 'focus left the input').toBe(input);
	expect([input.selectionStart, input.selectionEnd], 'selection moved').toEqual([1, 2]);
	expect(input.value).toBe('abc');
}

async function rowFocusAndScrollKept(container: HTMLElement, outcome: Outcome) {
	await expect.poll(() => text(container, '[data-row="r0"] button'), poll).toBe('r0');
	const list = container.querySelector<HTMLElement>('[data-list]')!;
	const row = container.querySelector<HTMLButtonElement>('[data-row="r5"] button')!;
	row.focus();
	list.scrollTop = 90;
	expect(list.scrollTop).toBe(90);
	hold('results:xy');
	typeInto(container.querySelector<HTMLInputElement>('[data-query]')!, 'xy');
	await expect.poll(() => asked.includes('results:xy'), poll).toBe(true);
	await expect.poll(() => underBusy(container, '[data-row="r5"]'), poll).toBe(true);
	await finish(container, 'xy', outcome);
	expect(container.querySelector('[data-row="r5"] button'), 'the focused row was replaced').toBe(row);
	expect(document.activeElement, 'focus left the row').toBe(row);
	expect(container.querySelector('[data-list]')).toBe(list);
	expect(list.scrollTop, 'the list scrolled').toBe(90);
}

const mounts = { csr: () => render(FocusKeep), ssr: () => renderSSR(FocusKeep) };

each('the caret and selection in a field stay through a refresh', mounts, (container) => caretKept(container, 'lands'));
each('the caret and selection in a field stay through a failed refresh', mounts, (container) => caretKept(container, 'fails'));
each('a focused row and the list scroll stay through a refresh', mounts, (container) => rowFocusAndScrollKept(container, 'lands'));
each('a focused row and the list scroll stay through a failed refresh', mounts, (container) => rowFocusAndScrollKept(container, 'fails'));
