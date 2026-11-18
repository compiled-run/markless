import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import type { StorageSeedMetadata } from '@markless/serializer';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

// A .tsrx page is the artifact the document host reads storage seeds off, so a
// storage() call in a component it imports has to reach the page's own list.

vi.setConfig({ testTimeout: 30_000 });

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.close()));
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

const toggle = `
import { storage } from '@markless/core';
export function ModeToggle() @{
	let mode = storage('colour-mode', 'system');
	<button type="button" onClick={() => (mode = 'dark')}>{mode}</button>
}
`;

const toolbar = `
import { storage } from '@markless/core';
import { ModeToggle } from './index.ts';
export function Toolbar() @{
	let density = storage('row-density', 'cozy');
	<nav data-density={density}><ModeToggle /></nav>
}
`;

const page = `
import { Toolbar } from './toolbar.tsrx';
import { ModeToggle } from './toggle.tsrx';
export default function Page() @{
	<main>
		<Toolbar />
		<aside><ModeToggle /></aside>
	</main>
}
`;

async function startFixture(entrySource: string) {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-storage-seeds-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(join(src, 'toggle.tsrx'), toggle);
	await writeFile(join(src, 'index.ts'), `export * from './toggle.tsrx';\n`);
	await writeFile(join(src, 'toolbar.tsrx'), toolbar);
	const entry = join(src, 'page.tsrx');
	await writeFile(entry, entrySource);
	vi.stubEnv('MARKLESS_PRERENDER', '1');
	const server = await createServer({
		configFile: false,
		root: fixtureRoot,
		logLevel: 'silent',
		environments: {
			ssr: {
				consumer: 'server',
				build: { rolldownOptions: { input: { prerender: entry } } },
			},
		},
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(root) },
		server: { hmr: true, middlewareMode: true, ws: false, watch: null },
	});
	vi.unstubAllEnvs();
	servers.push(server);
	const render = () =>
		server.transformIndexHtml(
			'/',
			'<html><head></head><body><div id="app"></div></body></html>',
		);
	return { entry, server, render };
}

async function pageSeeds(server: ViteDevServer, entry: string) {
	const module = (await server.ssrLoadModule(entry)) as {
		readonly default: { readonly storageSeeds?: ReadonlyArray<StorageSeedMetadata> };
	};
	return (module.default.storageSeeds ?? []).map((seed) => [seed.driverKey, seed.fallback]);
}

test('a page carries the storage seeds of the components it imports, nested ones included, once each', async () => {
	const { entry, server, render } = await startFixture(page);

	expect(await pageSeeds(server, entry)).toEqual([
		['row-density', 'cozy'],
		['colour-mode', 'system'],
	]);
	const head = (await render()).split('<body>')[0];
	expect(head).toContain('"data-colour-mode"');
	expect(head).toContain('"data-row-density"');
});

test('a page with its own storage() keeps its seed first and adds the children after it', async () => {
	const { entry, server } = await startFixture(`
import { storage } from '@markless/core';
import { ModeToggle } from './toggle.tsrx';
export default function Page() @{
	let font = storage('font-scale', 'normal');
	<main data-font={font}><ModeToggle /></main>
}
`);

	expect(await pageSeeds(server, entry)).toEqual([
		['font-scale', 'normal'],
		['colour-mode', 'system'],
	]);
});
