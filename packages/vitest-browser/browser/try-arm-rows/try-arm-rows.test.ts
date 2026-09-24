import { afterEach, expect, test } from 'vitest';
import { cleanup, render, renderSSR } from '../../src/index.ts';
import Catch from './tar-catch.tsrx';
import Flat from './tar-flat.tsrx';
import Nested from './tar-nested.tsrx';
import Resettle from './tar-resettle.tsrx';

afterEach(cleanup);

const text = (selector: string) => document.querySelector(selector)?.textContent;
const rows = () => document.querySelectorAll('[data-row]').length;
const click = (row: string) => document.querySelector<HTMLElement>(`[data-row="${row}"]`)!.click();

async function pinFlat() {
	await expect.poll(rows).toBe(3);
	click('r3');
	await expect.poll(() => text('[data-picked]')).toBe('r3');
	click('r1');
	await expect.poll(() => text('[data-picked]')).toBe('r1');
	click('r2');
	await expect.poll(() => text('[data-picked]')).toBe('r2');
}

test('CSR: rows inside a settled @try arm dispatch their handlers', async () => {
	await render(Flat);
	await pinFlat();
});

test('SSR: rows inside a settled @try arm dispatch their handlers', async () => {
	await renderSSR(Flat);
	await pinFlat();
});

async function pinResettle() {
	await expect.poll(() => text('[data-row="west-b"]')).toBe('west-b');
	click('west-b');
	await expect.poll(() => text('[data-chosen]')).toBe('west-b');
	document.querySelector<HTMLElement>('[data-zone]')!.click();
	await expect.poll(() => text('[data-row="east-a"]')).toBe('east-a');
	expect(rows()).toBe(2);
	click('east-a');
	await expect.poll(() => text('[data-chosen]')).toBe('east-a');
	click('east-b');
	await expect.poll(() => text('[data-chosen]')).toBe('east-b');
}

test('CSR: rows inside a @try arm dispatch after pending settles and after a re-settle', async () => {
	await render(Resettle);
	await pinResettle();
});

test('SSR: rows inside a @try arm dispatch after pending settles and after a re-settle', async () => {
	await renderSSR(Resettle);
	await pinResettle();
});

async function pinCatch() {
	await expect.poll(rows).toBe(2);
	click('c2');
	await expect.poll(() => text('[data-retried]')).toBe('c2');
	click('c1');
	await expect.poll(() => text('[data-retried]')).toBe('c1');
}

test('CSR: rows inside a @catch arm dispatch their handlers', async () => {
	await render(Catch);
	await pinCatch();
});

test('SSR: rows inside a @catch arm dispatch their handlers', async () => {
	await renderSSR(Catch);
	await pinCatch();
});

async function pinNested() {
	await expect.poll(rows).toBe(3);
	click('b3');
	await expect.poll(() => text('[data-taken]')).toBe('b3');
	click('b1');
	await expect.poll(() => text('[data-taken]')).toBe('b1');
	click('b2');
	await expect.poll(() => text('[data-taken]')).toBe('b2');
}

test('CSR: nested rows inside a settled @try arm dispatch their handlers', async () => {
	await render(Nested);
	await pinNested();
});

test('SSR: nested rows inside a settled @try arm dispatch their handlers', async () => {
	await renderSSR(Nested);
	await pinNested();
});
