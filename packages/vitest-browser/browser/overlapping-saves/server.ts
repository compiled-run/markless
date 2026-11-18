import { IN_PLACE_LOCATION_HEADER } from '@markless/web/fns/in-place-headers';

// An in-page flag API under /overlap/: every save and every read waits until the test answers it, one by one.
export type Flag = { id: string; name: string; on: boolean };
export type Todo = { id: string; title: string };
export type Board = { flags: Flag[]; todos: Todo[] };

type Waiting = { readonly what: string; readonly answer: (ok?: boolean) => void };
type Server = {
	flags: Flag[];
	todos: Todo[];
	next: number;
	reads: Waiting[];
	saves: Waiting[];
	readsSent: number;
	/** The key each detail read was sent with. */
	details: string[];
	savesSent: string[];
	/** Answer every request at once instead of waiting for the test. */
	open: boolean;
	/** Moves on each reset, so a request left over from an earlier test answers without touching the store. */
	generation: number;
};

const seed = (): Pick<Server, 'flags' | 'todos' | 'next'> => ({
	flags: [
		{ id: 'a', name: 'A', on: false },
		{ id: 'b', name: 'B', on: false },
		{ id: 'c', name: 'C', on: false },
	],
	todos: [{ id: '1', title: 'Milk' }],
	next: 2,
});
const shared = globalThis as typeof globalThis & { __overlapServer?: Server };
export const server: Server = (shared.__overlapServer ??= {
	...seed(),
	reads: [],
	saves: [],
	readsSent: 0,
	details: [],
	savesSent: [],
	open: true,
	generation: 0,
});

export function resetServer(): void {
	server.generation++;
	for (const waiting of [...server.reads.splice(0), ...server.saves.splice(0)]) waiting.answer();
	Object.assign(server, seed(), { readsSent: 0, details: [], savesSent: [], open: true });
}

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const board = (): Board => ({ flags: server.flags.map((flag) => ({ ...flag })), todos: [...server.todos] });

function wait(queue: Waiting[], what: string): Promise<boolean> {
	if (server.open) return Promise.resolve(true);
	return new Promise((done) => queue.push({ what, answer: (ok = true) => done(ok) }));
}

async function respond(url: URL, method: string, body: string): Promise<Response> {
	if (method === 'GET') {
		server.readsSent++;
		if (url.pathname === '/overlap/detail') {
			const key = url.searchParams.get('key') ?? '';
			server.details.push(key);
			return (await wait(server.reads, 'read')) ? answer({ key }) : answer('read failed', 500);
		}
		// The answer is what the store held when the read arrived, as a real server's would be.
		const seen = board();
		return (await wait(server.reads, 'read')) ? answer(seen) : answer('read failed', 500);
	}
	const what = `${url.pathname.slice('/overlap/'.length)} ${body}`.trim();
	const generation = server.generation;
	server.savesSent.push(what);
	if (!(await wait(server.saves, what))) return answer(`Could not save ${what}`, 500);
	if (generation !== server.generation) return answer({ ok: true });
	// A save whose answer points the page somewhere else.
	if (url.pathname === '/overlap/leave')
		return new Response('{}', { headers: { [IN_PLACE_LOCATION_HEADER]: '/elsewhere' } });
	if (url.pathname === '/overlap/flip')
		server.flags = server.flags.map((flag) => (flag.id === body ? { ...flag, on: !flag.on } : flag));
	if (url.pathname === '/overlap/set') {
		const [id, on] = body.split(' ');
		server.flags = server.flags.map((flag) => (flag.id === id ? { ...flag, on: on === 'on' } : flag));
	}
	if (url.pathname === '/overlap/add') server.todos = [...server.todos, { id: String(server.next++), title: body }];
	return answer({ ok: true });
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer(): void {
	const real = globalThis.fetch;
	if ((real as { __overlapStub?: true }).__overlapStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), location.href);
		if (!url.pathname.startsWith('/overlap/')) return real(input, init);
		return respond(url, (init?.method ?? 'GET').toUpperCase(), String(init?.body ?? ''));
	};
	(stub as { __overlapStub?: true }).__overlapStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadBoard(): Promise<Board> {
	if (typeof window === 'undefined') return board();
	const response = await fetch('/overlap/board');
	if (!response.ok) throw new Error('Board unavailable');
	return (await response.json()) as Board;
}

export async function loadDetail(key: string): Promise<{ key: string }> {
	if (typeof window === 'undefined') return { key };
	const response = await fetch(`/overlap/detail?key=${encodeURIComponent(key)}`);
	if (!response.ok) throw new Error('Detail unavailable');
	return (await response.json()) as { key: string };
}

async function save(path: string, body: string): Promise<void> {
	const response = await fetch(`/overlap/${path}`, { method: 'POST', body });
	if (!response.ok) throw new Error(`Could not save ${body}`);
}

export const flip = (id: string) => save('flip', id);
export const setFlag = (id: string, on: boolean) => save('set', `${id} ${on ? 'on' : 'off'}`);
export const addTodo = (title: string) => save('add', title);
export const leave = () => save('leave', '');
