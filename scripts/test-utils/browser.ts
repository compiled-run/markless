import { chromium, type Browser, type BrowserType } from '@playwright/test';

/**
 * Launches a browser whose `close()` kills its process group instead of asking it to shut down.
 * A graceful shutdown waits for the browser to tear down its own processes, which under CPU
 * contention outlasts a hook's budget; a test never checks that shutdown, so it does not wait on it.
 */
export async function launchBrowser(type: BrowserType = chromium): Promise<Browser> {
	const server = await type.launchServer();
	const browser = await type.connect(server.wsEndpoint());
	const disconnect = browser.close.bind(browser);
	browser.close = async (options) => {
		await disconnect(options);
		await server.kill();
	};
	return browser;
}
