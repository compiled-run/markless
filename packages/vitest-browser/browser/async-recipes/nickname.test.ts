import { afterEach, expect, test } from 'vitest';
import { cleanup, render } from '../../src/index.ts';
import Nickname from './nickname.tsrx';
import { press, textOf, type, until } from './support.ts';

type Held = { readonly name: string; readonly signal?: AbortSignal | null; answer: (status: number) => void };

// A stand-in for the app's own /api/nickname route that holds each save until the test answers it, and honours its signal.
const server = { name: 'Ada', loads: 0, saves: [] as Held[], aborted: 0 };
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
	const url = new URL(String(input), location.href);
	if (url.pathname !== '/api/nickname') return real(input, init);
	if ((init?.method ?? 'GET') === 'GET') {
		server.loads++;
		return new Response(server.name);
	}
	const name = String(init?.body);
	return new Promise<Response>((resolve, reject) => {
		const held: Held = {
			name,
			signal: init?.signal,
			answer: (status) => {
				if (status === 200) server.name = name;
				resolve(new Response('', { status }));
			},
		};
		init?.signal?.addEventListener('abort', () => {
			server.aborted++;
			reject(init.signal!.reason);
		});
		server.saves.push(held);
	});
}) as typeof fetch;

afterEach(async () => {
	for (const held of server.saves) held.answer(200);
	await cleanup();
	Object.assign(server, { name: 'Ada', loads: 0, saves: [], aborted: 0 });
});

test('a newer save aborts the one still out, and only the newer one reaches the page', async () => {
	await render(Nickname);
	await until(() => textOf('section p'), 'Nickname: Ada');
	const loadsBefore = server.loads;
	type('Grace');
	press('Save');
	await until(() => server.saves.length, 1);
	type('Linus');
	press('Save');
	await until(() => server.saves.length, 2);
	expect(server.aborted).toBe(1);
	expect(server.saves[0]!.signal?.aborted).toBe(true);
	expect(server.saves[1]!.signal?.aborted).toBe(false);
	server.saves[1]!.answer(200);
	await until(() => textOf('section p'), 'Nickname: Linus');
	expect(server.loads).toBe(loadsBefore + 1);
	expect(textOf('section > p')).toBe('');
	expect(document.querySelector('[aria-busy]')).toBeNull();
	await until(() => textOf('[data-markless-announcer]'), 'Updated');
});

test("the newest save's failure still shows in @catch, after the content it keeps", async () => {
	await render(Nickname);
	await until(() => textOf('section p'), 'Nickname: Ada');
	type('Grace');
	press('Save');
	await until(() => server.saves.length, 1);
	server.saves[0]!.answer(503);
	await until(() => textOf('section > p'), 'Saving failed (503)');
	expect(textOf('section div p')).toBe('Nickname: Ada');
});
