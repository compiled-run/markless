import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../../src/index.ts';
import IndexKeyed from './index-keyed.tsrx';
import Moves from './moves.tsrx';
import Picked from './picked.tsrx';
import Wrapped from './wrapped.tsrx';

// Row components given the loop index follow every kind of move, client- and server-rendered.
afterEach(cleanup);

const lines = () =>
	[...document.querySelectorAll('[data-r]')].map((node) => {
		const text = node.querySelector('[data-text]')?.textContent ?? node.textContent;
		const taps = node.querySelector('[data-taps]')?.textContent;
		return `${text?.replace(/\s+/g, ' ').trim()}${taps === undefined ? '' : ` taps ${taps}`}`;
	});
const press = (selector: string) => document.querySelector<HTMLElement>(selector)!.click();
const row = (label: string) => document.querySelector<HTMLElement>(`[data-r="${label}"]`)!;

async function movesKeepState() {
	await expect.poll(lines).toEqual(['1. a taps 0', '2. b taps 0', '3. c taps 0']);
	const c = row('c');
	c.querySelector<HTMLElement>('[data-tap]')!.click();
	await expect.poll(lines).toEqual(['1. a taps 0', '2. b taps 0', '3. c taps 1']);
	press('[data-drop]');
	await expect.poll(lines).toEqual(['1. a taps 0', '2. c taps 1']);
	press('[data-flip]');
	await expect.poll(lines).toEqual(['1. c taps 1', '2. a taps 0']);
	press('[data-middle]');
	await expect.poll(lines).toEqual(['1. c taps 1', '2. m taps 0', '3. a taps 0']);
	press('[data-front]');
	await expect.poll(lines).toEqual(['1. w taps 0', '2. c taps 1', '3. m taps 0', '4. a taps 0']);
	expect(row('c')).toBe(c);
}

test('CSR: a moved row follows delete, reorder, middle and front inserts, keeping its state and node', async () => {
	await render(Moves);
	await movesKeepState();
});

test('SSR: a moved row follows delete, reorder, middle and front inserts, keeping its state and node', async () => {
	await renderSSR(Moves);
	await movesKeepState();
});

async function indexKeyed() {
	await expect.poll(lines).toEqual(['1. x', '2. y']);
	press('[data-front]');
	await expect.poll(lines).toEqual(['1. w', '2. x', '3. y']);
	press('[data-drop]');
	await expect.poll(lines).toEqual(['1. x', '2. y']);
}

// Known defect, with or without an index prop: a component row in a list keyed by index builds no new row in the
// browser, and the server render refuses it as interactive.
test.fails('CSR: a list keyed by index shows each position\'s item and number', async () => {
	await render(IndexKeyed);
	await indexKeyed();
});

test.fails('SSR: a list keyed by index shows each position\'s item and number', async () => {
	await renderSSR(IndexKeyed);
	await indexKeyed();
});

const picked = () => document.querySelector('[data-picked]')?.textContent;
async function callbackIndex() {
	await expect.poll(lines).toEqual(['x', 'y']);
	press('[data-front]');
	await expect.poll(lines).toEqual(['w', 'x', 'y']);
	row('y').querySelector<HTMLElement>('[data-pick]')!.click();
	await expect.poll(picked).toBe('2');
}

test('CSR: a callback prop capturing the index reads the moved row\'s index', async () => {
	await render(Picked);
	await callbackIndex();
});

test('SSR: a callback prop capturing the index reads the moved row\'s index', async () => {
	await renderSSR(Picked);
	await callbackIndex();
});

const at = () => [...document.querySelectorAll('li')].map((li) => `${li.getAttribute('data-at')}:${li.textContent?.replace(/\s+/g, ' ').trim()}`);
async function wrapperIndex() {
	await expect.poll(at).toEqual(['0:0. x', '1:1. y']);
	press('[data-front]');
	await expect.poll(at).toEqual(['0:0. w', '1:1. x', '2:2. y']);
}

test('CSR: a wrapper attribute reading the index follows a moved wrapped row', async () => {
	await render(Wrapped);
	await wrapperIndex();
});

test('SSR: a wrapper attribute reading the index follows a moved wrapped row', async () => {
	await renderSSR(Wrapped);
	await wrapperIndex();
});
