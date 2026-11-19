import { chromium, type Browser, type BrowserType, type LaunchOptions } from '@playwright/test';

/** Names the variable holding the URL of the run's browser broker (scripts/test-utils/browser-broker.ts). */
export const BROWSER_BROKER_ENV = 'MARKLESS_BROWSER_BROKER';

export interface BrowserRequest {
	readonly worker: string;
	readonly type: 'chromium' | 'firefox' | 'webkit';
	readonly options?: LaunchOptions;
}

/**
 * Opens a browser for one test file or test. Under a run with the browser broker, it connects to
 * the browser this worker slot shares, and `close()` disconnects, which closes every context the
 * connection opened. Otherwise it launches a browser whose `close()` kills its process group
 * instead of asking it to shut down: a graceful shutdown waits for the browser to tear down its
 * own processes, which under CPU contention outlasts a hook's budget.
 */
export async function launchBrowser(
	type: BrowserType = chromium,
	options?: LaunchOptions,
): Promise<Browser> {
	const broker = process.env[BROWSER_BROKER_ENV];
	if (broker) {
		const request: BrowserRequest = {
			worker: process.env.VITEST_POOL_ID ?? String(process.pid),
			type: type.name() as BrowserRequest['type'],
			options,
		};
		const response = await fetch(broker, { method: 'POST', body: JSON.stringify(request) });
		const answer = await response.text();
		if (!response.ok)
			throw new Error(`the browser broker could not start ${type.name()}: ${answer}`);
		return type.connect(answer);
	}
	const server = await type.launchServer(options);
	const browser = await type.connect(server.wsEndpoint());
	const disconnect = browser.close.bind(browser);
	browser.close = async (options) => {
		await disconnect(options);
		await server.kill();
	};
	return browser;
}
