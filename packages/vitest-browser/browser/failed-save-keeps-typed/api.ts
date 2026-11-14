// An in-page stand-in for a save route under /fst/ that always answers 500.
type Api = { posts: number; loads: number };
const shared = globalThis as typeof globalThis & { __fstApi?: Api };
export const api: Api = (shared.__fstApi ??= { posts: 0, loads: 0 });

// Installed before the runtime wraps fetch, so its write watch sees these calls as the page's own.
export function installApi(): void {
	const real = globalThis.fetch;
	if ((real as { __fstStub?: true }).__fstStub) return;
	const stub = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input), location.href);
		if (!url.pathname.startsWith('/fst/')) return real(input, init);
		api.posts++;
		await new Promise((resolve) => setTimeout(resolve, 5));
		return new Response('nope', { status: 500 });
	};
	(stub as { __fstStub?: true }).__fstStub = true;
	globalThis.fetch = stub as typeof fetch;
}

export async function save(): Promise<void> {
	const response = await fetch('/fst/save', { method: 'POST' });
	if (!response.ok) throw new Error(`Saving failed (${response.status})`);
}

export async function loadPerson(id: string): Promise<{ first: string }> {
	api.loads++;
	await new Promise((resolve) => setTimeout(resolve, 5));
	return { first: `Ada ${id}` };
}
