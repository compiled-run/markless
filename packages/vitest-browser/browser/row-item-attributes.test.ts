import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../src/index.ts';
import Page from './row-item-attributes/page.tsrx';
import Seats from './row-item-attributes/seats.tsrx';
import FramedSeats from './row-item-attributes/framed-seats.tsrx';

// Keyed rows over state whose attributes are worked out from the row's item: a method call, a ternary on a field, a string concat.

afterEach(cleanup);

const errors: unknown[] = [];
addEventListener('error', (event) => errors.push(event.error ?? event.message));
addEventListener('unhandledrejection', (event) => errors.push(event.reason));

const click = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const suits = () =>
	[...document.querySelectorAll<HTMLElement>('[data-hand] li')].map(
		(row) => `${row.textContent}:${row.dataset.suit}`,
	);
const seats = () =>
	[...document.querySelectorAll<HTMLElement>('[data-seats] li')].map(
		(row) => `${row.textContent?.trim()}:${row.className}:${row.querySelector('img')?.getAttribute('src')}`,
	);

async function itemAttributes() {
	errors.length = 0;
	expect(suits()).toEqual(['7♠:♠', '2♥:♥', 'K♦:♦']);
	click('[data-push]');
	await expect.poll(suits).toEqual(['7♠:♠', '2♥:♥', 'K♦:♦', '9♣:♣']);
	click('[data-reverse]');
	await expect.poll(suits).toEqual(['9♣:♣', 'K♦:♦', '2♥:♥', '7♠:♠']);
	click('[data-pop]');
	await expect.poll(suits).toEqual(['9♣:♣', 'K♦:♦', '2♥:♥']);
	expect(seats()).toEqual(['a:free:/seat-a.png', 'b:free:/seat-b.png', 'c:free:/seat-c.png']);
	click('[data-pick]');
	await expect.poll(seats).toEqual(['a:free:/seat-a.png', 'b:free:/seat-b.png', 'c:picked:/seat-c.png']);
	click('[data-seats] li');
	await expect.poll(seats).toEqual(['a:picked:/seat-a.png', 'b:free:/seat-b.png', 'c:picked:/seat-c.png']);
	expect(errors).toEqual([]);
}

async function pickSecond() {
	errors.length = 0;
	expect(seats()).toEqual(['a:free:/seat-a.png', 'b:free:/seat-b.png']);
	click('[data-pick]');
	await expect.poll(seats).toEqual(['a:free:/seat-a.png', 'b:picked:/seat-b.png']);
	click('[data-seats] li');
	await expect.poll(seats).toEqual(['a:picked:/seat-a.png', 'b:picked:/seat-b.png']);
	expect(errors).toEqual([]);
}

test('CSR: a row attribute worked out from its item follows writes to the list and to one item', async () => {
	await render(Page);
	await itemAttributes();
});

test('SSR resume: a row attribute worked out from its item follows writes to the list and to one item', async () => {
	await renderSSR(Page);
	await itemAttributes();
});

test('CSR: a row projected as children follows a write to one item by a literal index', async () => {
	await render(FramedSeats);
	await pickSecond();
});

test('SSR resume: a row projected as children follows a write to one item by a literal index', async () => {
	await renderSSR(FramedSeats);
	await pickSecond();
});

test('SSR resume: a write to one item by a literal index updates its row', async () => {
	await renderSSR(Seats);
	await pickSecond();
});
