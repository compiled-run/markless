import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServer, type HotPayload, type Plugin, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import type { MarklessRolldownPluginApi } from '../src/types.ts';
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

			const reloadsBeforeEdit = fullReloadCount(send, fixture.root);
			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('<span>hello</span>', '<span>fresh render data</span>'),
			);
			await waitForFullReloadCountAbove(send, reloadsBeforeEdit, fixture.root);

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
			const reloadsBeforeEdit = fullReloadCount(send, fixture.root);
			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('<span>hello</span>', '<span>fresh render data</span>'),
				`${fixture.entry}?markless-resume`,
			);
			await waitForFullReloadCountAbove(send, reloadsBeforeEdit, fixture.root);

			await forceProgramReload(server, fetches);

			expect(fetches.failures).toEqual([]);
			expect(await requestHtml(server)).toContain('<span>fresh render data</span>');
		} finally {
			await server?.close();
		}
	});

	test('transforms a parent whose imported child has no current capture metadata', async () => {
		const fixture = await createComponentSsrFixture();
		const plugins = markless();
		let server: ViteDevServer | undefined;
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: { ssr: { build: { rolldownOptions: { input: fixture.entry } } } },
				plugins: [...plugins, fixtureSsrHost()],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			// Vite page-reloads a changed index.html, and the fixture's setup writes arrive late.
			server.watcher.unwatch(fixture.root);

			expect(await requestHtml(server)).toContain('child original');

			// An edit clears the child's capture metadata through this seam, and Vite can
			// still answer a re-request for the child off its cached transform result, so
			// nothing re-records the metadata a re-transformed parent reads.
			await invalidateGeneratedModules(plugins)(fixture.child, 'server');
			hardInvalidateSsrModule(server, fixture.entry);

			await expect(
				server.environments.ssr.transformRequest(fixture.entry),
			).resolves.toBeTruthy();
			expect(await requestHtml(server)).toContain('child original');
		} finally {
			await server?.close();
		}
	});
});

function invalidateGeneratedModules(
	plugins: readonly Plugin[],
): MarklessRolldownPluginApi['invalidateGeneratedModules'] {
	const api = plugins.find((plugin) => plugin.name === 'vite-plugin-markless')?.api as
		| Partial<MarklessRolldownPluginApi>
		| undefined;
	const invalidate = api?.invalidateGeneratedModules;
	if (!invalidate) throw new Error('markless plugin does not expose invalidateGeneratedModules');
	return invalidate;
}

// A parent only re-enters transform when its own module is hard invalidated; every
// other module keeps whatever Vite already has for it.
function hardInvalidateSsrModule(server: ViteDevServer, file: string) {
	const modules = server.environments.ssr.moduleGraph.getModulesByFile(file);
	expect(modules?.size).toBeGreaterThan(0);
	for (const module of modules ?? []) {
		server.environments.ssr.moduleGraph.invalidateModule(module, new Set(), Date.now(), true);
	}
}

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

async function createComponentSsrFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-ssr-hmr-reload-child-')));
	cleanupRoots.push(root);
	const src = join(root, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(root, 'index.html'), '<html><head></head><body></body></html>');

	const childSource =
		"import { state } from '@markless/core';\n\n" +
		'export function Child({ label }) @{\n' +
		'\tlet clicks = state(0);\n\n' +
		'\t<section data-child>\n' +
		'\t\t<p>{label}</p>\n' +
		'\t\t<button data-child-button onClick={() => clicks++}>{clicks}</button>\n' +
		'\t</section>\n}\n';
	const child = join(src, 'child.tsrx');
	await writeFile(child, childSource);

	const source =
		"import { state } from '@markless/core';\n" +
		"import { Child } from './child.tsrx';\n\n" +
		'export function App() @{\n' +
		'\tlet count = state(0);\n\n' +
		'\t<main>\n\t\t<button data-counter onClick={() => count++}>{count}</button>\n' +
		'\t\t<Child label="child original" />\n\t</main>\n}\n';
	const entry = join(src, 'root.tsrx');
	await writeFile(entry, source);

	return { child, entry, root };
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

// Vite core page-reloads a changed index.html as `{ path: '*' }` with no `triggeredBy`,
// and `unwatch` does not reliably suppress that on linux. Only the markless plugin's
// edit-driven reload names the file that triggered it, so only that one may be counted.
function isEditDrivenReload(payload: unknown, fixtureRoot: string) {
	const message = payload as HotPayload | undefined;
	return (
		message?.type === 'full-reload' &&
		typeof message.triggeredBy === 'string' &&
		message.triggeredBy.startsWith(fixtureRoot)
	);
}

function fullReloadCount(send: ReturnType<typeof vi.spyOn>, fixtureRoot: string) {
	return send.mock.calls.filter(([payload]) => isEditDrivenReload(payload, fixtureRoot)).length;
}

async function waitForFullReloadCountAbove(
	send: ReturnType<typeof vi.spyOn>,
	count: number,
	fixtureRoot: string,
) {
	let fullReloads = 0;
	await vi.waitFor(() => {
		fullReloads = fullReloadCount(send, fixtureRoot);
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
