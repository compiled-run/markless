import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { BrowserServer, LaunchOptions } from '@playwright/test';

/** Names the variable holding the URL of the run's browser broker. */
export const BROWSER_BROKER_ENV = 'MARKLESS_BROWSER_BROKER';

export interface BrowserRequest {
	readonly type: 'chromium' | 'firefox' | 'webkit';
	readonly options?: LaunchOptions;
}

export interface BrowserLease {
	readonly lease: string;
	readonly wsEndpoint: string;
}

// Each headless launch leaks WindowServer mach ports on macOS and costs a cold start, so the run
// shares one browser per type and launch options across its workers; an unleased browser closes
// after idleMs so it holds no memory between users.

export type LaunchServer = (
	type: BrowserRequest['type'],
	options: LaunchOptions | undefined,
) => Promise<Pick<BrowserServer, 'wsEndpoint' | 'kill' | 'on'>>;

type SharedBrowser = {
	readonly key: string;
	readonly server: ReturnType<LaunchServer>;
	state:
		| { readonly phase: 'leased'; readonly leases: Set<string> }
		| { readonly phase: 'idle'; readonly closing: ReturnType<typeof setTimeout> };
};

export async function startBrowserBroker(
	launch: LaunchServer,
	idleMs: number,
): Promise<() => Promise<void>> {
	const shared = new Map<string, SharedBrowser>();
	const byLease = new Map<string, SharedBrowser>();

	const close = (browser: SharedBrowser) => {
		if (shared.get(browser.key) === browser) shared.delete(browser.key);
		void browser.server.then((server) => server.kill(), () => {});
	};

	const acquire = (request: BrowserRequest): { browser: SharedBrowser; lease: string } => {
		const key = JSON.stringify([request.type, request.options ?? {}]);
		let browser = shared.get(key);
		if (!browser) {
			const server = launch(request.type, request.options);
			const created: SharedBrowser = { key, server, state: { phase: 'leased', leases: new Set() } };
			server.then(
				(launched) => launched.on('close', () => shared.get(key) === created && shared.delete(key)),
				() => shared.get(key) === created && shared.delete(key),
			);
			shared.set(key, (browser = created));
		}
		if (browser.state.phase === 'idle') {
			clearTimeout(browser.state.closing);
			browser.state = { phase: 'leased', leases: new Set() };
		}
		const lease = randomUUID();
		browser.state.leases.add(lease);
		byLease.set(lease, browser);
		return { browser, lease };
	};

	const release = (lease: string) => {
		const browser = byLease.get(lease);
		if (!browser || browser.state.phase !== 'leased') throw new Error(`no open browser lease ${lease}`);
		byLease.delete(lease);
		browser.state.leases.delete(lease);
		if (browser.state.leases.size === 0) {
			const idle = browser;
			idle.state = { phase: 'idle', closing: setTimeout(() => close(idle), idleMs) };
		}
	};

	const http = createServer(async (incoming, response) => {
		try {
			let body = '';
			for await (const chunk of incoming) body += chunk;
			if (incoming.url === '/release') {
				release(body);
				response.end();
				return;
			}
			const { browser, lease } = acquire(JSON.parse(body) as BrowserRequest);
			try {
				const answer: BrowserLease = { lease, wsEndpoint: (await browser.server).wsEndpoint() };
				response.end(JSON.stringify(answer));
			} catch (error) {
				release(lease);
				throw error;
			}
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
		const open = [...shared.values()];
		for (const browser of open) if (browser.state.phase === 'idle') clearTimeout(browser.state.closing);
		const launched = await Promise.allSettled(open.map((browser) => browser.server));
		await Promise.all(
			launched.map((result) => (result.status === 'fulfilled' ? result.value.kill() : undefined)),
		);
	};
}
