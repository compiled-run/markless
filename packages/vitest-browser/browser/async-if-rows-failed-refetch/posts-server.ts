// An in-page stand-in for the app's API: same-origin URLs under /if-rows/, answered without a network.
export type Post = { id: string; title: string; likes: number };

type Server = { posts: Post[]; failNextRead: boolean; reads: number };
const shared = globalThis as typeof globalThis & { __ifRowsServer?: Server };
export const server: Server = (shared.__ifRowsServer ??= {
	posts: [],
	failNextRead: false,
	reads: 0,
});

export function resetServer() {
	server.posts = ['a', 'b', 'c'].map((id) => ({ id, title: `post ${id}`, likes: 0 }));
	server.failNextRead = false;
	server.reads = 0;
}
resetServer();

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function answer(method: string, body: string): Promise<Response> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	if (method === 'GET') {
		server.reads++;
		if (server.failNextRead) {
			server.failNextRead = false;
			return json({ message: 'offline' }, 500);
		}
		return json(server.posts);
	}
	const change = JSON.parse(body) as { op: string; id: string; title?: string };
	if (change.op === 'like')
		server.posts = server.posts.map((post) =>
			post.id === change.id ? { ...post, likes: post.likes + 1 } : post,
		);
	if (change.op === 'rename')
		server.posts = server.posts.map((post) =>
			post.id === change.id ? { ...post, title: change.title! } : post,
		);
	if (change.op === 'delete') server.posts = server.posts.filter((post) => post.id !== change.id);
	if (change.op === 'add')
		server.posts = [...server.posts, { id: change.id, title: `post ${change.id}`, likes: 0 }];
	return json({ ok: true });
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer() {
	const real = globalThis.fetch;
	if ((real as { __ifRowsStub?: true }).__ifRowsStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), location.href);
		if (!url.pathname.startsWith('/if-rows/')) return real(input, init);
		return answer((init?.method ?? 'GET').toUpperCase(), String(init?.body ?? ''));
	};
	(stub as { __ifRowsStub?: true }).__ifRowsStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadPosts(): Promise<Post[]> {
	if (typeof window === 'undefined') return server.posts;
	const response = await fetch('/if-rows/posts');
	if (!response.ok) throw new Error(((await response.json()) as { message: string }).message);
	return (await response.json()) as Post[];
}

export async function save(change: { op: string; id: string; title?: string }): Promise<void> {
	const response = await fetch('/if-rows/posts', {
		method: 'POST',
		body: JSON.stringify(change),
	});
	if (!response.ok) throw new Error('save refused');
}
