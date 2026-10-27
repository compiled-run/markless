import { join, resolve } from 'pathe';
import { createBuilder, createServer } from 'vite';
import { expect, test, vi } from 'vitest';

// A whole Vite build: 2.6 s alone at load average 54, past 5 s in the pre-commit unit lane.
vi.setConfig({ testTimeout: 30_000 });

// The page imports one constant from a CLI barrel whose other export spawns processes, the shape
// that once shipped markless.dev's whole CLI to the browser behind an empty stand-in.
const fixture = resolve(import.meta.dirname, '../fixtures/vite-node-in-browser');

const modules = [
	'  → src/cli/index.ts',
	'  → src/cli/agent.ts',
	'  → src/cli/process-ancestry.ts',
	'      imports "node:child_process", a Node built-in module',
	'      imports "node:os", a Node built-in module',
];

test('the build fails and names every module from the page to the Node import', async () => {
	const builder = await createBuilder({
		root: fixture,
		configFile: join(fixture, 'vite.config.ts'),
		logLevel: 'silent',
		build: { write: false },
	});
	await expect(builder.buildApp()).rejects.toThrow(
		[
			'  index.html',
			'  → src/main.ts',
			'  → src/root.tsrx',
			'  → src/root.tsrx (Markless render data module)',
			...modules,
			'      uses `process` at 9:10, a global only Node has: String(process.ppid)',
		].join('\n'),
	);
});

test('the dev server refuses the module that imports Node', async () => {
	const server = await createServer({
		root: fixture,
		configFile: join(fixture, 'vite.config.ts'),
		logLevel: 'silent',
		server: { middlewareMode: true, ws: false },
		optimizeDeps: { noDiscovery: true, include: [] },
	});
	try {
		const client = server.environments.client!;
		for (const url of ['/src/main.ts', '/src/root.tsrx', '/src/cli/index.ts', '/src/cli/agent.ts'])
			await client.transformRequest(url);
		// Vite resolves a module's imports concurrently, so the first built-in to fail is reported.
		const error = await client.transformRequest('/src/cli/process-ancestry.ts').catch((e) => e);
		expect((error as Error).message).toContain(
			['  src/main.ts', '  → src/root.tsrx', ...modules.slice(0, 3)].join('\n'),
		);
		expect((error as Error).message).toMatch(
			/\n {6}imports "node:(?:child_process|os)", a Node built-in module\n/,
		);
	} finally {
		await server.close();
	}
});
