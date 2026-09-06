import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

const CHILD_RENDER_DATA_ID = '\0virtual:markless:render-data:src%2Fchild.tsrx';

// A page whose child is reached through the parent's render data: the browser
// pulls the child's render-data module by name, then the child's own module.
async function createFixture() {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-render-data-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(
		join(src, 'child.tsrx'),
		'export default function Child({ label }: { readonly label: string }) @{\n' +
			'\t<span class="child">{label}</span>\n}\n',
	);
	const entry = join(src, 'root.tsrx');
	await writeFile(
		entry,
		"import { state } from '@markless/core';\n" +
			"import Child from './child.tsrx';\n\n" +
			'export function App() @{\n' +
			'\tlet count = state(0);\n\n' +
			'\t<main>\n\t\t<button onClick={() => count++}>{count}</button>\n' +
			'\t\t<Child label="hi" />\n\t</main>\n}\n',
	);
	return { entry, root: fixtureRoot };
}

async function createDevServer(fixture: { entry: string; root: string }) {
	return await createServer({
		configFile: false,
		root: fixture.root,
		logLevel: 'error',
		environments: {
			ssr: {
				consumer: 'server',
				build: { rolldownOptions: { input: { prerender: fixture.entry } } },
			},
		},
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(root) },
		server: { middlewareMode: true, ws: false },
	});
}

test('a child linked by the server environment still serves the browser the render-data export its own module imports', async () => {
	const fixture = await createFixture();
	let server: ViteDevServer | undefined;
	try {
		server = await createDevServer(fixture);

		// The server render runs first in dev and links the child, registering the
		// server flavour of the child's render-data module under the shared id.
		await server.environments.ssr.transformRequest('/src/root.tsrx');

		// The browser reaches the child's render-data module by name before it ever
		// requests the child's own module.
		const renderData = await server.environments.client.transformRequest(CHILD_RENDER_DATA_ID);
		const childModule = await server.environments.client.transformRequest('/src/child.tsrx');

		expect(childModule?.code).toContain('marklessPrerenderData');
		expect(renderData?.code).toContain('export const marklessPrerenderData');
	} finally {
		await server?.close();
	}
}, 120_000);

test('the server environment keeps its own render-data module', async () => {
	const fixture = await createFixture();
	let server: ViteDevServer | undefined;
	try {
		server = await createDevServer(fixture);
		await server.environments.ssr.transformRequest('/src/root.tsrx');

		const serverRenderData =
			await server.environments.ssr.transformRequest(CHILD_RENDER_DATA_ID);
		const serverChild = await server.environments.ssr.transformRequest('/src/child.tsrx');

		expect(serverRenderData?.code).toContain('marklessRenderData');
		expect(serverRenderData?.code).not.toContain('marklessPrerenderData');
		expect(serverChild?.code).not.toContain('marklessPrerenderData');
	} finally {
		await server?.close();
	}
}, 120_000);

test.each(['full', 'render-data'] as const)(
	'a child rebuilt on the server after %s invalidation restores its browser render-data export',
	async (invalidation) => {
		const fixture = await createFixture();
		const server = await createDevServer(fixture);
		try {
			await server.environments.ssr.transformRequest('/src/root.tsrx');
			await server.environments.client.transformRequest('/src/child.tsrx');
			const child = join(fixture.root, 'src/child.tsrx');
			const plugin = server.config.plugins.find(
				(plugin) => plugin.name === 'vite-plugin-markless',
			)!;
			await server.watcher.close();
			const changedSource = (await readFile(child, 'utf8')).replace(
				'class="child"',
				'class="updated"',
			);
			await writeFile(child, changedSource);
			await plugin.api.invalidateGeneratedModules(
				child,
				invalidation === 'render-data' ? 'server' : undefined,
				invalidation === 'render-data' ? changedSource : undefined,
			);
			server.environments.ssr.moduleGraph.invalidateAll();
			server.environments.client.moduleGraph.invalidateAll();
			await server.environments.ssr.transformRequest('/src/child.tsrx');

			const renderData =
				await server.environments.client.transformRequest(CHILD_RENDER_DATA_ID);
			expect(renderData?.code).toContain('export const marklessPrerenderData');
			expect(renderData?.code).toContain('updated');
		} finally {
			await server.close();
		}
	},
	120_000,
);

// A gate the test opens: the child's client transform parks on it, so a second
// request can be issued while the regeneration is provably in flight.
function gatedChildClientTransform() {
	let release!: () => void;
	let reached!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const arrived = new Promise<void>((resolve) => (reached = resolve));
	const plugin = {
		name: 'test:gate-child-client-transform',
		enforce: 'pre' as const,
		async transform(
			this: { environment?: { config?: { consumer?: string } } },
			_code: string,
			id: string,
		) {
			if (this.environment?.config?.consumer !== 'client' || !id.endsWith('/child.tsrx'))
				return null;
			reached();
			await gate;
			return null;
		},
	};
	return { plugin, release, arrived };
}

async function createGatedDevServer(fixture: { entry: string; root: string }) {
	const gate = gatedChildClientTransform();
	const server = await createServer({
		configFile: false,
		root: fixture.root,
		logLevel: 'error',
		environments: {
			ssr: {
				consumer: 'server',
				build: { rolldownOptions: { input: { prerender: fixture.entry } } },
			},
		},
		plugins: [gate.plugin, markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(root) },
		server: { middlewareMode: true, ws: false },
	});
	return { server, ...gate };
}

// The browser asks for a child's render-data module by name while the client
// is still regenerating it. Handing that request the registration of the
// moment served the server flavour, which Vite cached for the client until the
// next full invalidation - every later import of `marklessPrerenderData` from
// it failed. Vite dedupes only identical urls, so the second request carries a
// query and is its own pipeline landing on the same module node.
test('a load that lands while the child regenerates waits and receives the client flavour', async () => {
	const fixture = await createFixture();
	const { server, release, arrived } = await createGatedDevServer(fixture);
	try {
		await server.environments.ssr.transformRequest('/src/root.tsrx');
		const first = server.environments.client.transformRequest(CHILD_RENDER_DATA_ID);
		await arrived;
		const second = server.environments.client.transformRequest(`${CHILD_RENDER_DATA_ID}?raced`);
		await new Promise((resolve) => setTimeout(resolve, 20));
		release();
		const [firstCode, secondCode] = await Promise.all([first, second]);

		expect(firstCode?.code).toContain('export const marklessPrerenderData');
		expect(secondCode?.code).toContain('export const marklessPrerenderData');
		expect(
			server.environments.client.moduleGraph.getModuleById(CHILD_RENDER_DATA_ID)
				?.transformResult?.code,
		).toContain('export const marklessPrerenderData');
	} finally {
		release();
		await server.close();
	}
}, 60_000);

// The child's own client transform may already be running (the browser asked
// for the module itself) when its render-data module is requested: the
// regeneration joins that pending transform, whose import analysis resolves the
// render-data id re-entrantly. A resolve must never wait on the regeneration or
// the two wait on each other.
test('a render-data request joining an already running child transform completes with the client flavour', async () => {
	const fixture = await createFixture();
	const { server, release, arrived } = await createGatedDevServer(fixture);
	try {
		await server.environments.ssr.transformRequest('/src/root.tsrx');
		// The absolute path: the url the regeneration itself asks for, so the two
		// pipelines are one and the re-entrant resolve runs outside the regeneration.
		const child = server.environments.client.transformRequest(
			join(fixture.root, 'src/child.tsrx'),
		);
		await arrived;
		const renderData = server.environments.client.transformRequest(CHILD_RENDER_DATA_ID);
		await new Promise((resolve) => setTimeout(resolve, 20));
		release();
		const [childCode, renderDataCode] = await Promise.all([child, renderData]);

		expect(childCode?.code).toContain('marklessPrerenderData');
		expect(renderDataCode?.code).toContain('export const marklessPrerenderData');
	} finally {
		release();
		await server.close();
	}
}, 60_000);
