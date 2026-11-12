// An in-page stand-in for the app's API routes: same-origin URLs under /mut/, answered without a network.
export type Answer = {
	readonly status?: number;
	readonly body?: unknown;
	readonly wait?: Promise<unknown>;
	readonly headers?: Record<string, string>;
};

type Server = {
	items: string[];
	gets: string[];
	posts: string[];
	reads: Map<string, number>;
	holdReads?: Promise<unknown>;
	handlerWait?: Promise<unknown>;
	lateGate?: Promise<unknown>;
	searches: number;
	handlersStarted: number;
	nextPost: Array<Answer>;
};

const shared = globalThis as typeof globalThis & { __mutServer?: Server };
export const server: Server = (shared.__mutServer ??= {
	items: ['Ada'],
	gets: [],
	posts: [],
	reads: new Map(),
	nextPost: [],
	searches: 0,
	handlersStarted: 0,
});

export function resetServer() {
	server.items = ['Ada'];
	server.gets = [];
	server.posts = [];
	server.reads = new Map();
	server.holdReads = undefined;
	server.handlerWait = undefined;
	server.lateGate = undefined;
	server.searches = 0;
	server.handlersStarted = 0;
	server.nextPost = [];
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), {
		status,
		headers: { 'content-type': typeof body === 'string' ? 'text/plain' : 'application/json', ...headers },
	});

async function answer(url: URL, method: string, body: unknown): Promise<Response> {
	if (method === 'GET') {
		server.gets.push(url.pathname + url.search);
		const count = (server.reads.get(url.pathname + url.search) ?? 0) + 1;
		server.reads.set(url.pathname + url.search, count);
		// The answer is what the server held when it was asked, however long it is held back.
		const items = [...server.items];
		if (server.holdReads) await server.holdReads;
		await new Promise((resolve) => setTimeout(resolve, 5));
		return json({ items, run: count });
	}
	server.posts.push(`${method} ${url.pathname} ${String(body ?? '')}`);
	if (url.pathname === '/mut/search') return json({ run: ++server.searches });
	const planned = server.nextPost.shift() ?? {};
	if (planned.wait) await planned.wait;
	else await new Promise((resolve) => setTimeout(resolve, 5));
	const status = planned.status ?? 200;
	if (status < 400 && url.pathname === '/mut/items' && typeof body === 'string' && body) server.items = [...server.items, body];
	return json(planned.body ?? { ok: status < 400 }, status, planned.headers);
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer() {
	const real = globalThis.fetch;
	if ((real as { __mutStub?: true }).__mutStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : undefined;
		const url = new URL(request?.url ?? String(input), location.href);
		if (!url.pathname.startsWith('/mut/')) return real(input, init);
		const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
		const body = init?.body ?? (request && method !== 'GET' ? await request.text() : undefined);
		return answer(url, method, body);
	};
	(stub as { __mutStub?: true }).__mutStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadItems(path = '/mut/items'): Promise<{ items: string[]; run: number }> {
	if (typeof window === 'undefined') return { items: [...server.items], run: 0 };
	const response = await fetch(path);
	return (await response.json()) as { items: string[]; run: number };
}

export async function addItem(name: string): Promise<void> {
	const response = await fetch('/mut/items', { method: 'POST', body: name });
	if (!response.ok) throw new Error(await response.text());
}

// A handler that sends no write and runs until the test lets it finish.
export async function waitInHandler(): Promise<void> {
	server.handlersStarted++;
	await server.handlerWait;
}
