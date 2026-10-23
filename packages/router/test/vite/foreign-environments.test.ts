import { fileURLToPath } from 'node:url';
import { createServer, type Environment, type ViteDevServer } from 'vite';
import { createVitest } from 'vitest/node';
import { expect, test } from 'vitest';

const fixture = fileURLToPath(new URL('../../fixtures/router-app/', import.meta.url));
const SERVER_ENTRY = 'virtual:markless-router/server-entry';

function inputOf(environment: Environment): string {
	const build = environment.config.build;
	return JSON.stringify(build.rolldownOptions?.input ?? build.rollupOptions?.input ?? null);
}

// Nitro turns every server environment it adopts as a service into a fetchable one that runs in its worker.
function adoptedByNitro(environment: Environment): boolean {
	return (
		typeof (environment as { dispatchFetch?: unknown }).dispatchFetch === 'function' ||
		/vite[/\\]services/.test(environment.config.build.outDir)
	);
}

function expectRouterOwnsOnlySsr(server: ViteDevServer, foreign: readonly string[]) {
	const ssr = server.environments.ssr!;
	expect(inputOf(ssr)).toContain(SERVER_ENTRY);
	expect(adoptedByNitro(ssr)).toBe(true);
	for (const name of foreign) {
		const environment = server.environments[name];
		expect(environment, name).toBeDefined();
		expect(inputOf(environment!), name).not.toContain(SERVER_ENTRY);
		expect(adoptedByNitro(environment!), name).toBe(false);
	}
}

test('a custom server environment keeps its own config: the router claims only ssr', async () => {
	const server = await createServer({
		root: fixture,
		configFile: `${fixture}vite.config.ts`,
		logLevel: 'silent',
		environments: {
			edge: { consumer: 'server' },
			worker: { consumer: 'server', build: { rolldownOptions: { input: 'src/worker.ts' } } },
		},
		server: { port: 0, strictPort: false, ws: false },
	});
	try {
		expectRouterOwnsOnlySsr(server, ['edge']);
		expect(inputOf(server.environments.worker!)).toContain('src/worker.ts');
		expect(inputOf(server.environments.worker!)).not.toContain(SERVER_ENTRY);
	} finally {
		await server.close();
	}
}, 120_000);

test("Vitest's own environment stays Vitest's under a routed app's config", async () => {
	const vitest = await createVitest(
		'test',
		{ root: fixture, config: `${fixture}vite.config.ts`, watch: false, fsModuleCache: false },
		{ logLevel: 'silent', server: { ws: false } },
	);
	try {
		expectRouterOwnsOnlySsr(vitest.projects[0]!.vite, ['__vitest__']);
	} finally {
		await vitest.close();
	}
}, 120_000);
