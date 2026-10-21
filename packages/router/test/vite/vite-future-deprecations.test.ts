import { fileURLToPath } from 'node:url';
import { createLogger, createServer, type ViteDevServer } from 'vite';
import { afterEach, expect, test } from 'vitest';

const fixture = fileURLToPath(new URL('../../fixtures/router-app/', import.meta.url));
let server: ViteDevServer | undefined;
afterEach(async () => {
	await server?.close();
	server = undefined;
});

test("a routed app's dev server calls no Vite API that Vite's future flags deprecate", async () => {
	const warnings: string[] = [];
	const logger = createLogger('warn');
	logger.warn = (message) => void warnings.push(message);
	logger.warnOnce = (message) => void warnings.push(message);
	server = await createServer({
		root: fixture,
		configFile: `${fixture}vite.config.ts`,
		customLogger: logger,
		future: 'warn',
		server: { port: 0, strictPort: false, ws: false },
	});
	await server.listen();
	const url = server.resolvedUrls?.local[0];
	expect(url).toBeTruthy();
	const response = await fetch(new URL('/', url));
	expect(response.status).toBe(200);
	expect(await response.text()).toContain('Markless Router App');
	expect(warnings.filter((message) => message.includes('[vite future]'))).toEqual([]);
}, 120_000);
