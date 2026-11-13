// An in-page stand-in for a save route under /hr/: answers 500, or fails the connection, as the test asks.
export type Failure = 'http' | 'network';

type Api = { failure: Failure; posts: number; loads: number };
const shared = globalThis as typeof globalThis & { __hrApi?: Api };
export const api: Api = (shared.__hrApi ??= { failure: 'http', posts: 0, loads: 0 });

export function resetApi(failure: Failure): void {
	api.failure = failure;
	api.posts = 0;
	api.loads = 0;
}

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installApi(): void {
	const real = globalThis.fetch;
	if ((real as { __hrStub?: true }).__hrStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input), location.href);
		if (!url.pathname.startsWith('/hr/')) return real(input, init);
		api.posts++;
		await new Promise((resolve) => setTimeout(resolve, 5));
		if (api.failure === 'network') throw new TypeError('Failed to fetch');
		return new Response('nope', { status: 500 });
	};
	(stub as { __hrStub?: true }).__hrStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function save(): Promise<void> {
	const response = await fetch('/hr/save', { method: 'POST' });
	if (!response.ok) throw new Error(`Saving failed (${response.status})`);
}

export async function loadThing(): Promise<{ loads: number }> {
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { loads: ++api.loads };
}
