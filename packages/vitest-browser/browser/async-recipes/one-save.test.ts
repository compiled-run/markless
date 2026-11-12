import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import Mugs from './mugs.tsrx';
import OneSave from './one-save.tsrx';
import { press, textOf, until } from './support.ts';

// A stand-in for the app's own /api/mugs route that holds each save until the test answers it.
const shelf = { mugs: ['Short mug'], saves: [] as Array<() => void> };
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(String(input), location.href);
	if (url.pathname !== '/api/mugs') return real(input, init);
	if ((init?.method ?? 'GET') === 'GET') return Response.json(shelf.mugs.map((name, id) => ({ id, name })));
	const name = (JSON.parse(String(init?.body)) as { name: string }).name;
	return new Promise<Response>((resolve) =>
		shelf.saves.push(() => {
			shelf.mugs = [...shelf.mugs, name];
			resolve(Response.json({ ok: true }));
		}),
	);
}) as typeof fetch;

afterEach(async () => {
	for (const answer of shelf.saves) answer();
	await cleanup();
	Object.assign(shelf, { mugs: ['Short mug'], saves: [] });
});

const button = () => document.querySelector('button')!;

test('an async onClick button is marked busy from the click until the reload lands, and still works', async () => {
	await render(Mugs);
	await until(() => textOf('li'), 'Short mug');
	press('Add a tall mug');
	await until(() => button().getAttribute('aria-busy'), 'true');
	expect(button().disabled).toBe(false);
	expect(button().hasAttribute('aria-disabled')).toBe(false);
	press('Add a tall mug');
	await until(() => shelf.saves.length, 2);
	for (const answer of shelf.saves) answer();
	await until(() => document.querySelectorAll('li').length, 3);
	await until(() => button().hasAttribute('aria-busy'), false);
});

test('a handler that keeps its own saving state sends one save at a time and shows the button as unavailable', async () => {
	await render(OneSave);
	await until(() => textOf('section p'), 'Mugs: 1');
	expect(button().getAttribute('aria-disabled')).toBe('false');
	press('Add a tall mug');
	await until(() => button().getAttribute('aria-disabled'), 'true');
	expect(button().getAttribute('aria-busy')).toBe('true');
	press('Add a tall mug');
	await new Promise((done) => requestAnimationFrame(done));
	expect(shelf.saves.length).toBe(1);
	shelf.saves[0]!();
	await until(() => textOf('section p'), 'Mugs: 2');
	await until(() => button().hasAttribute('aria-busy'), false);
	expect(button().getAttribute('aria-disabled')).toBe('false');
	press('Add a tall mug');
	await until(() => shelf.saves.length, 2);
});
