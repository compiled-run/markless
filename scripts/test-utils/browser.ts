import { chromium, type Browser, type BrowserType, type LaunchOptions } from '@playwright/test';
import { BROWSER_BROKER_ENV, type BrowserLease, type BrowserRequest } from './browser-broker.ts';

/**
 * Opens a browser for one test file or test. Under a run with the browser broker, it connects to
 * the browser the run's workers share; `close()` disconnects, which closes every context the
 * connection opened, and hands the lease back. Otherwise it launches a browser whose `close()`
 * kills its process group instead of asking it to shut down: a graceful shutdown waits for the
 * browser to tear down its own processes, which under CPU contention outlasts a hook's budget.
 */
export async function launchBrowser(
	type: BrowserType = chromium,
	options?: LaunchOptions,
): Promise<Browser> {
	const broker = process.env[BROWSER_BROKER_ENV];
	if (broker) {
		const request: BrowserRequest = { type: type.name() as BrowserRequest['type'], options };
		const response = await fetch(broker, { method: 'POST', body: JSON.stringify(request) });
		if (!response.ok)
			throw new Error(`the browser broker could not start ${type.name()}: ${await response.text()}`);
		const { lease, wsEndpoint } = (await response.json()) as BrowserLease;
		const release = () => fetch(`${broker}/release`, { method: 'POST', body: lease });
		const browser = await type.connect(wsEndpoint).catch(async (error: unknown) => {
			await release();
			throw error;
		});
		const disconnect = browser.close.bind(browser);
		browser.close = async (options) => {
			await disconnect(options);
			await release();
		};
		return browser;
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
