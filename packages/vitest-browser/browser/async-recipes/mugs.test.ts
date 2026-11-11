import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import Mugs from './mugs.tsrx';
import { listOf, press, textOf, until, watchLoudness } from './support.ts';

// A stand-in for the app's own /api/mugs route, installed before the page wraps fetch.
const shelf = { mugs: ['Short mug'], loads: 0, saves: 0, failNext: false, holdLoad: undefined as Promise<void> | undefined };
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(String(input), location.href);
	if (url.pathname !== '/api/mugs') return real(input, init);
	if ((init?.method ?? 'GET') === 'GET') {
		shelf.loads++;
		await shelf.holdLoad;
		return Response.json(shelf.mugs.map((name, id) => ({ id, name })));
	}
	shelf.saves++;
	if (shelf.failNext) return new Response('', { status: 503 });
	shelf.mugs = [...shelf.mugs, (JSON.parse(String(init?.body)) as { name: string }).name];
	return Response.json({ ok: true });
}) as typeof fetch;

afterEach(async () => {
	await cleanup();
	Object.assign(shelf, { mugs: ['Short mug'], loads: 0, saves: 0, failNext: false, holdLoad: undefined });
});

test('the list loads again on its own after the save, kept and busy while it loads', async () => {
	const { container } = await render(Mugs);
	await until(() => listOf('li'), ['Short mug']);
	let release!: () => void;
	shelf.holdLoad = new Promise((resolve) => (release = resolve));
	const loudness = watchLoudness();
	press('Add a tall mug');
	await until(() => shelf.loads, 2);
	expect(shelf.saves).toBe(1);
	expect(listOf('li')).toEqual(['Short mug']);
	await until(() => container.querySelector('ul')?.getAttribute('aria-busy'), 'true');
	await until(() => textOf('[data-markless-announcer]'), 'Updating…');
	release();
	await until(() => listOf('li'), ['Short mug', 'Tall mug']);
	expect(container.querySelector('[aria-busy]')).toBeNull();
	await until(() => textOf('[data-markless-announcer]'), 'Updated');
	expect(loudness().said).toEqual(['Updating…', 'Updated']);
	expect(shelf.loads).toBe(2);
});

test('a failed save loads nothing again and shows its error in @catch', async () => {
	await render(Mugs);
	await until(() => listOf('li'), ['Short mug']);
	shelf.failNext = true;
	press('Add a tall mug');
	await until(() => textOf('section p'), 'Saving failed (503)');
	expect(shelf.loads).toBe(1);
});
