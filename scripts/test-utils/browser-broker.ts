import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, firefox, webkit, type BrowserServer, type LaunchOptions } from '@playwright/test';
import { BROWSER_BROKER_ENV, type BrowserRequest } from './browser.ts';

// Each headless launch leaks WindowServer mach ports on macOS and costs a cold start, so the run
// keeps one browser per worker slot, type and launch options, started on first request.
export default async function startBrowserBroker(): Promise<() => Promise<void>> {
	const types = { chromium, firefox, webkit };
	const servers = new Map<string, Promise<BrowserServer>>();

	const serve = (request: BrowserRequest): Promise<BrowserServer> => {
		const key = JSON.stringify([request.worker, request.type, request.options ?? {}]);
		let server = servers.get(key);
		if (!server) {
			server = types[request.type].launchServer(request.options as LaunchOptions | undefined);
			servers.set(key, server);
			server.then(
				(launched) => launched.on('close', () => servers.delete(key)),
				() => servers.delete(key),
			);
		}
		return server;
	};

	const http = createServer(async (incoming, response) => {
		try {
			let body = '';
			for await (const chunk of incoming) body += chunk;
			const server = await serve(JSON.parse(body) as BrowserRequest);
			response.end(server.wsEndpoint());
		} catch (error) {
			response.statusCode = 500;
			response.end(String(error instanceof Error ? (error.stack ?? error.message) : error));
		}
	});
	await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
	process.env[BROWSER_BROKER_ENV] = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

	return async () => {
		delete process.env[BROWSER_BROKER_ENV];
		http.close();
		const launched = await Promise.allSettled(servers.values());
		await Promise.all(
			launched.map((result) => (result.status === 'fulfilled' ? result.value.kill() : undefined)),
		);
	};
}
