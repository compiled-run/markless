// An in-page stand-in for a todo API under /hold/, answered without a network; reads and saves wait for the test when told to.
export type Todo = { id: string; title: string };
export type Shelf = { name: string; todos: Todo[]; likes: number };

type Server = {
	name: string;
	todos: Todo[];
	likes: number;
	reads: number;
	posts: string[];
	holdReads?: Promise<unknown>;
	holdSaves?: Promise<unknown>;
	holdHandler?: Promise<unknown>;
	stop?: () => void;
	failReads: number;
	next: number;
};

const seed = (): Shelf => ({ name: 'Groceries', todos: [{ id: '1', title: 'Milk' }], likes: 3 });
const shared = globalThis as typeof globalThis & { __holdServer?: Server };
export const server: Server = (shared.__holdServer ??= {
	...seed(),
	reads: 0,
	posts: [],
	failReads: 0,
	next: 2,
});

export function resetServer(): void {
	Object.assign(server, seed(), {
		reads: 0,
		posts: [],
		holdReads: undefined,
		holdSaves: undefined,
		failReads: 0,
		next: 2,
	});
}

const answer = (body: unknown, status = 200) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

async function respond(url: URL, method: string, body: string, signal?: AbortSignal | null): Promise<Response> {
	if (method === 'GET') {
		server.reads++;
		const shelf: Shelf = { name: server.name, todos: [...server.todos], likes: server.likes };
		if (server.holdReads) await server.holdReads;
		if (server.failReads > 0) {
			server.failReads--;
			return answer('Shelf unavailable', 500);
		}
		return answer(shelf);
	}
	server.posts.push(`${url.pathname} ${body}`);
	if (server.holdSaves)
		await new Promise((done, fail) => {
			void server.holdSaves!.then(done);
			signal?.addEventListener('abort', () => fail(signal.reason));
		});
	if (body.includes('fail')) return answer(`Could not save ${body}`, 500);
	switch (url.pathname) {
		case '/hold/todos':
			server.todos = [...server.todos, { id: String(server.next++), title: body }];
			break;
		case '/hold/like':
			server.likes++;
			break;
		case '/hold/rename':
			server.name = body;
			break;
		case '/hold/delete':
			server.todos = server.todos.filter((todo) => todo.id !== body);
	}
	return answer({ ok: true });
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer(): void {
	const real = globalThis.fetch;
	if ((real as { __holdStub?: true }).__holdStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), location.href);
		if (!url.pathname.startsWith('/hold/')) return real(input, init);
		return respond(url, (init?.method ?? 'GET').toUpperCase(), String(init?.body ?? ''), init?.signal);
	};
	(stub as { __holdStub?: true }).__holdStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadShelf(): Promise<Shelf> {
	if (typeof window === 'undefined') return seed();
	const response = await fetch('/hold/shelf');
	if (!response.ok) throw new Error(await response.text());
	return (await response.json()) as Shelf;
}

async function save(path: string, body: string, signal?: AbortSignal): Promise<void> {
	const response = await fetch(path, { method: 'POST', body, signal });
	if (!response.ok) throw new Error(await response.text());
}

export const addTodo = (title: string, signal?: AbortSignal) => save('/hold/todos', title, signal);
export const like = () => save('/hold/like', '');
export const rename = (name: string) => save('/hold/rename', name);
export const remove = (id: string) => save('/hold/delete', id);

// Work a handler does after its save, finished when the test lets it.
export async function somethingElse(): Promise<void> {
	await server.holdHandler;
}

export function addStoppable(title: string): Promise<void> {
	const controller = new AbortController();
	server.stop = () => controller.abort();
	return addTodo(title, controller.signal);
}

export const stopSave = (): void => server.stop?.();
