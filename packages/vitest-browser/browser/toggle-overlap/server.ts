// An in-page stand-in for a favorites API under /star/, answered without a network; each save waits until the test answers it.
type Server = { favorite: boolean; reads: number; saves: Array<{ body: string; answer: () => void }> };

const shared = globalThis as typeof globalThis & { __starServer?: Server };
export const server: Server = (shared.__starServer ??= { favorite: false, reads: 0, saves: [] });

export function resetServer(): void {
	for (const save of server.saves.splice(0)) save.answer();
	Object.assign(server, { favorite: false, reads: 0 });
}

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installServer(): void {
	const real = globalThis.fetch;
	if ((real as { __starStub?: true }).__starStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(String(input), location.href);
		if (!url.pathname.startsWith('/star/')) return real(input, init);
		if ((init?.method ?? 'GET').toUpperCase() === 'GET') {
			server.reads++;
			return json({ rows: [{ id: 'a', favorite: server.favorite }] });
		}
		const body = String(init?.body ?? '');
		let answer!: () => void;
		const answered = new Promise<void>((done) => (answer = done));
		server.saves.push({ body, answer });
		await answered;
		server.favorite = body === 'true';
		return json({ ok: true });
	};
	(stub as { __starStub?: true }).__starStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function loadRows(): Promise<{ rows: Array<{ id: string; favorite: boolean }> }> {
	if (typeof window === 'undefined') return { rows: [{ id: 'a', favorite: false }] };
	return (await (await fetch('/star/rows')).json()) as { rows: Array<{ id: string; favorite: boolean }> };
}

export async function saveFavorite(next: boolean): Promise<void> {
	await fetch('/star/favorite', { method: 'POST', body: String(next) });
}
