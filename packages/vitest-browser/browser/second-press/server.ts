// An in-page contact API under /second-press/: every save and every read waits until the test answers it.
export type Contact = { id: string; name: string; favorite: boolean };

type Waiting = { readonly what: string; readonly answer: (ok?: boolean) => void };
type Server = { contact: Contact; reads: Waiting[]; saves: Waiting[]; open: boolean; generation: number };

const shared = globalThis as typeof globalThis & { __secondPressServer?: Server };
export const server: Server = (shared.__secondPressServer ??= {
	contact: { id: 'c1', name: 'Ada', favorite: true },
	reads: [],
	saves: [],
	open: true,
	generation: 0,
});

export function resetServer(): void {
	server.generation++;
	for (const waiting of [...server.reads.splice(0), ...server.saves.splice(0)]) waiting.answer();
	Object.assign(server, { contact: { id: 'c1', name: 'Ada', favorite: true }, open: true });
}

function wait(queue: Waiting[], what: string): Promise<boolean> {
	if (server.open) return Promise.resolve(true);
	return new Promise((done) => queue.push({ what, answer: (ok = true) => done(ok) }));
}

async function respond(method: string, body: string): Promise<Response> {
	if (method === 'GET') {
		const seen = { ...server.contact };
		await wait(server.reads, 'read');
		return new Response(JSON.stringify(seen));
	}
	const generation = server.generation;
	if (!(await wait(server.saves, `favorite ${body}`))) return new Response('Saving failed', { status: 500 });
	if (generation === server.generation) server.contact = { ...server.contact, favorite: body === 'true' };
	return new Response(JSON.stringify(server.contact));
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer(): void {
	const real = globalThis.fetch;
	if ((real as { __secondPressStub?: true }).__secondPressStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), location.href);
		if (!url.pathname.startsWith('/second-press/')) return real(input, init);
		return respond((init?.method ?? 'GET').toUpperCase(), String(init?.body ?? ''));
	};
	(stub as { __secondPressStub?: true }).__secondPressStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadContact(): Promise<Contact> {
	if (typeof window === 'undefined') return { ...server.contact };
	const response = await fetch('/second-press/contact');
	if (!response.ok) throw new Error('Contact unavailable');
	return (await response.json()) as Contact;
}

export async function saveFavorite(favorite: boolean): Promise<void> {
	const response = await fetch('/second-press/contact', { method: 'PATCH', body: String(favorite) });
	if (!response.ok) throw new Error('Saving failed');
}
