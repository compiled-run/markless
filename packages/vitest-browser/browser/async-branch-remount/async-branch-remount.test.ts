import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import NotesDrawer from './abr-notes.tsrx';
import SearchDialog from './abr-search.tsrx';
import SlowPicker from './abr-slow.tsrx';

afterEach(cleanup);

const list = () => document.querySelector<HTMLElement>('[data-list]');
const names = () => [...document.querySelectorAll('[data-result]')].map((node) => node.textContent?.trim());
const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();

async function opensFreshEachTime() {
	expect(list()).toBeNull();

	click('[data-open]');
	await expect.poll(names).toEqual(['Accordion', 'Alert', 'Badge', 'Button', 'Calendar', 'Card', 'Dialog', 'Drawer']);
	const first = list()!;
	first.scrollTop = 60;
	await expect.poll(() => first.scrollTop).toBeGreaterThan(0);

	click('[data-open]');
	await expect.poll(list).toBeNull();
	expect(first.isConnected).toBe(false);

	const query = document.querySelector<HTMLInputElement>('[data-query]')!;
	query.value = 'dr';
	query.dispatchEvent(new Event('input', { bubbles: true }));

	const scrolled: Array<EventTarget | null> = [];
	const onScroll = (event: Event) => scrolled.push(event.target);
	document.addEventListener('scroll', onScroll, true);
	click('[data-open]');
	await expect.poll(names).toEqual(['Drawer']);
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	document.removeEventListener('scroll', onScroll, true);
	expect(scrolled).toEqual([]);
	const second = list()!;
	expect(second).not.toBe(first);
	expect(second.scrollTop).toBe(0);
	expect(document.querySelectorAll('[data-list]')).toHaveLength(1);
	expect(document.querySelector('[data-loading]')).toBeNull();

	// The fresh list keeps answering the search while it shows.
	query.value = 'a';
	query.dispatchEvent(new Event('input', { bubbles: true }));
	await expect.poll(names).toEqual(['Accordion', 'Alert', 'Badge', 'Calendar', 'Card', 'Dialog', 'Drawer']);
	expect(list()).toBe(second);
}

test('CSR: an @if holding an async list renders it fresh each time it shows', async () => {
	await render(SearchDialog);
	await opensFreshEachTime();
});

test('SSR: an @if holding an async list renders it fresh each time it shows', async () => {
	await renderSSR(SearchDialog);
	await opensFreshEachTime();
});

const drawer = () => document.querySelector('[data-drawer]');
const summaryText = () =>
	document.querySelector('[data-summary]')?.textContent ?? document.querySelector('[data-trouble]')?.textContent;

async function drawerSettlesFreshEachTime() {
	expect(document.querySelector('[data-folded]')).not.toBeNull();
	click('[data-toggle]');
	await expect.poll(summaryText).toBe('alpha summary');
	const first = drawer()!;
	expect(document.querySelector('[data-folded]')).toBeNull();

	click('[data-toggle]');
	await expect.poll(() => document.querySelector('[data-folded]')).not.toBeNull();
	click('[data-next]');
	click('[data-toggle]');
	await expect.poll(summaryText).toBe('beta summary');
	expect(drawer()).not.toBe(first);

	// While shown, the @try block keeps settling, including into its @catch content.
	click('[data-next]');
	await expect.poll(summaryText).toBe('No summary');
	click('[data-next]');
	await expect.poll(summaryText).toBe('alpha summary');
	expect(document.querySelectorAll('[data-drawer]')).toHaveLength(1);
}

test('CSR: an @if/@else holding a @try block settles fresh content each time it shows', async () => {
	await render(NotesDrawer);
	await drawerSettlesFreshEachTime();
});

test('SSR: an @if/@else holding a @try block settles fresh content each time it shows', async () => {
	await renderSSR(NotesDrawer);
	await drawerSettlesFreshEachTime();
});

// Navigation waits on this; a @try the page did not serve still counts once an @if renders it.
test('CSR: waiting for async content covers a @try that an @if rendered after start', async () => {
	const screen = await render(SlowPicker);
	click('[data-word]');
	click('[data-pick]');
	await expect.poll(() => document.querySelector('[data-wait]')).not.toBeNull();

	await (screen.runtime.runtime as { whenAsyncBoundariesSettled: () => Promise<void> }).whenAsyncBoundariesSettled();

	expect([...document.querySelectorAll('[data-option]')].map((node) => node.textContent)).toEqual([
		'fancy one',
		'fancy two',
	]);
});
