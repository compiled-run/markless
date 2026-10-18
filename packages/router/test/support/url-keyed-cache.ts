import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A shared cache that keys every response on its URL and ignores Vary, as some CDNs do.
export async function urlKeyedCache(upstream: string) {
	type Entry = { status: number; headers: Array<[string, string]>; body: Buffer };
	const entries = new Map<string, Entry>();
	const server = createServer(async (request, response) => {
		const key = request.url ?? '/';
		let entry = request.method === 'GET' ? entries.get(key) : undefined;
		if (!entry) {
			const headers = new Headers();
			for (const [name, value] of Object.entries(request.headers))
				if (typeof value === 'string' && name !== 'host' && name !== 'accept-encoding')
					headers.set(name, value);
			// A prefetch the browser abandons ends its upstream request instead of failing the run.
			const abandoned = new AbortController();
			response.on('close', () => abandoned.abort());
			try {
				const fetched = await fetch(upstream + key, {
					headers,
					redirect: 'manual',
					signal: abandoned.signal,
				});
				entry = {
					status: fetched.status,
					headers: [...fetched.headers].filter(
						([name]) =>
							!['content-encoding', 'content-length', 'transfer-encoding'].includes(name),
					),
					body: Buffer.from(await fetched.arrayBuffer()),
				};
			} catch {
				response.destroy();
				return;
			}
			if (request.method === 'GET' && entry.status >= 200 && entry.status < 300)
				entries.set(key, entry);
		}
		response.writeHead(entry.status, entry.headers);
		response.end(entry.body);
	});
	await new Promise<void>((listening) => server.listen(0, '127.0.0.1', listening));
	const { port } = server.address() as AddressInfo;
	return {
		origin: `http://127.0.0.1:${port}`,
		clear: () => entries.clear(),
		close: () =>
			new Promise<void>((closed) => {
				server.close(() => closed());
				server.closeAllConnections();
			}),
	};
}
