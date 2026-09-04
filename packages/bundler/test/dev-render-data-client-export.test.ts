import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
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

