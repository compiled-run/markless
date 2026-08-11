import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServer, type HotPayload, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import { MARKLESS_DEV_ERROR_CLIENT_ID } from '../src/dev-error/index.ts';
import { fixtureSsrHost } from '../fixtures/vite-ssr/src/dev-server.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

describe('SSR module runner program reload', () => {
	test('serves the generated modules to a program reload after an edit', async () => {
		const fixture = await createSsrFixture();
		let server: ViteDevServer | undefined;
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: { ssr: { build: { rolldownOptions: { input: fixture.entry } } } },
				plugins: [markless(), fixtureSsrHost()],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			// Vite page-reloads a changed index.html, and the fixture's setup writes arrive late.
			server.watcher.unwatch(fixture.root);

			const fetches = watchModuleFetches(server);
			const send = vi.spyOn(server.environments.client.hot, 'send');
			expect(await requestHtml(server)).toContain('<span>hello</span>');

			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('<span>hello</span>', '<span>fresh render data</span>'),
			);
			await waitForFullReloadCountAbove(send, 0);

			await forceProgramReload(server, fetches);

			expect(fetches.failures).toEqual([]);
			expect(await requestHtml(server)).toContain('<span>fresh render data</span>');
		} finally {
			await server?.close();
		}
	});

	test('serves the generated modules to a program reload after a query-suffixed edit', async () => {
		const fixture = await createSsrFixture();
		let server: ViteDevServer | undefined;
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: { ssr: { build: { rolldownOptions: { input: fixture.entry } } } },
				plugins: [markless(), fixtureSsrHost()],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			// Vite page-reloads a changed index.html, and the fixture's setup writes arrive late.
			server.watcher.unwatch(fixture.root);

			const fetches = watchModuleFetches(server);
			const send = vi.spyOn(server.environments.client.hot, 'send');
			expect(await requestHtml(server)).toContain('<span>hello</span>');

			// A browser reload can leave the client environment tracking the resume-source
			// request, so the watcher path carries a query the module graph has no file for.
			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('<span>hello</span>', '<span>fresh render data</span>'),
				`${fixture.entry}?markless-resume`,
			);
			await waitForFullReloadCountAbove(send, 0);

			await forceProgramReload(server, fetches);

			expect(fetches.failures).toEqual([]);
			expect(await requestHtml(server)).toContain('<span>fresh render data</span>');
		} finally {
			await server?.close();
		}
	});
});

type ModuleFetchLog = {
	readonly ids: string[];
	readonly failures: string[];
};

// The runner re-imports through the environment, so this is the concrete signal a
// program reload has started, and the only place its failures are observable.
function watchModuleFetches(server: ViteDevServer): ModuleFetchLog {
	const environment = server.environments.ssr;
	const fetchModule = environment.fetchModule.bind(environment);
	const log: ModuleFetchLog = { ids: [], failures: [] };
	environment.fetchModule = async (id, importer, options) => {
		log.ids.push(id);
		try {
			return await fetchModule(id, importer, options);
		} catch (error) {
			log.failures.push(`${id}: ${(error as Error)?.message ?? String(error)}`);
			throw error;
		}
	};
	return log;
}

// `full-reload` on the ssr environment's own channel is what makes its module runner
// drop every evaluated module and re-import its entry — Vite calls this a program reload.
async function forceProgramReload(server: ViteDevServer, fetches: ModuleFetchLog) {
	const before = fetches.ids.length;
	server.environments.ssr.hot.send({ type: 'full-reload' });
	await vi.waitFor(() => {
		expect(fetches.ids.slice(before).some((id) => id.includes('root.tsrx'))).toBe(true);
	});
}

async function createSsrFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-ssr-hmr-reload-')));
	cleanupRoots.push(root);
	const src = join(root, 'src');
	await mkdir(src, { recursive: true });
	const source =
		"import { state } from '@markless/core';\n\n" +
		'export function App() @{\n' +
		'\tlet count = state(0);\n\n' +
		'\t<section>\n\t\t<button data-counter onClick={() => count++}>{count}</button>\n' +
		'\t\t<span>hello</span>\n\t</section>\n}\n';
	await writeFile(join(root, 'index.html'), '<html><head></head><body></body></html>');
	const entry = join(src, 'root.tsrx');
	await writeFile(entry, source);
	return { entry, root, source };
}

async function requestHtml(server: ViteDevServer) {
	const response = await server.environments.ssr.dispatchFetch(
		new Request('http://markless.test/', { headers: { accept: 'text/html' } }),
	);
	expect(response.status).toBe(200);
	const html = await response.text();
	expect(html).toContain('/@vite/client');
	expect(html).toContain(MARKLESS_DEV_ERROR_CLIENT_ID);
	return html;
}

async function editFile(server: ViteDevServer, file: string, source: string, hotFile = file) {
	await writeFile(file, source);
	server.watcher.emit('change', hotFile);
}

async function waitForFullReloadCountAbove(send: ReturnType<typeof vi.spyOn>, count: number) {
	let fullReloads = 0;
	await vi.waitFor(() => {
		fullReloads = send.mock.calls.filter(([payload]) => {
			return (payload as HotPayload | undefined)?.type === 'full-reload';
		}).length;
		expect(fullReloads).toBeGreaterThan(count);
	});
	return fullReloads;
}

function marklessSourceAliases() {
	return [
		{
			find: '@markless/serializer/decode-client',
			replacement: repo('packages/serializer/src/value-decode-client.ts'),
		},
		{
			find: '@markless/bundler/rolldown',
			replacement: repo('packages/bundler/src/rolldown.ts'),
		},
		{ find: '@markless/bundler/preload', replacement: repo('packages/bundler/src/preload.ts') },
		{ find: '@markless/bundler/vite', replacement: repo('packages/bundler/src/vite/index.ts') },
		...(['core', 'web', 'runtime', 'serializer'] as const).flatMap((name) => [
			{
				find: new RegExp(`^@markless/${name}/(.+)$`),
				replacement: repo(`packages/${name}/src/$1.ts`),
			},
			{ find: `@markless/${name}`, replacement: repo(`packages/${name}/src/index.ts`) },
		]),
	];
}

function repo(path: string) {
	return resolve(root, path);
}
