import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import { MARKLESS_DEV_ERROR_EVENT } from '../src/dev-error/index.ts';
import { marklessSourceAliases } from './helpers.ts';

// A dev server start plus a prerender took up to 6.8 s under load in sibling dev tests.
vi.setConfig({ testTimeout: 30_000 });

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => server.close()));
	await Promise.all(cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const panels = `
import type { Children } from '@markless/core';
import { state } from '@markless/core';

export function Panel({ children }: { readonly children?: Children }) @{
	let shown = state(true);
	<article>
		<button type="button" data-toggle onClick={() => (shown = !shown)}>Toggle</button>
		@if (shown) {
			<div data-body>{children}</div>
		} @else {
			<p>Closed</p>
		}
	</article>
}
`;

const middle = `
import type { Children } from '@markless/core';
import { Panel } from './index.ts';

export function Middle({ children }: { readonly children?: Children }) @{
	<div><Panel>{children}</Panel></div>
}
`;

const page = (children: string) => `
import { state } from '@markless/core';
import { Middle } from './middle.tsrx';

export function App() @{
	let count = state(0);
	<main>
		<Middle>${children}</Middle>
	</main>
}
`;

const liveChildren = `<button type="button" data-projected onClick={() => (count = count + 1)}>Count {count}</button>`;
const staticChildren = `<span>Projected</span>`;

async function startFixture(children: string) {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-projection-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(join(src, 'panels.tsrx'), panels);
	await writeFile(join(src, 'index.ts'), `export * from './panels.tsrx';\n`);
	await writeFile(join(src, 'middle.tsrx'), middle);
	const entry = join(src, 'root.tsrx');
	await writeFile(entry, page(children));
	vi.stubEnv('MARKLESS_PRERENDER', '1');
	const server = await createServer({
		configFile: false,
		root: fixtureRoot,
		logLevel: 'silent',
		environments: {
			ssr: { consumer: 'server', build: { rolldownOptions: { input: { prerender: entry } } } },
		},
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(root) },
		server: { hmr: true, middlewareMode: true, ws: false, watch: null },
	});
	vi.unstubAllEnvs();
	servers.push(server);
	const send = vi.spyOn(server.environments.client.hot, 'send');
	const render = () =>
		server.transformIndexHtml('/', '<html><head></head><body><div id="app"></div></body></html>');
	return { entry, server, send, render };
}

function devErrors(send: ReturnType<typeof vi.spyOn>) {
	return send.mock.calls
		.map(([message]) => message as { type?: string; event?: string; data?: unknown })
		.filter((message) => message.type === 'custom' && message.event === MARKLESS_DEV_ERROR_EVENT)
		.map((message) => message.data as { diagnostics: ReadonlyArray<{ code: string; message: string }> });
}

const refusal =
	/MARKLESS_PROJECTION_LIVE_IN_BRANCH: <Middle> in .*middle\.tsrx passes <Panel> children .*they pass on the children <App> gives <Middle>, and its <button> handles click\), and <Panel> in .*panels\.tsrx renders its children inside @if \(shown\)/;

const refusedOnPage = 'MARKLESS_PROJECTION_LIVE_IN_BRANCH: &lt;Middle&gt; in ';

test('the dev server refuses live children projected into a redrawn arm, on the page and in the overlay', async () => {
	const { send, render, server } = await startFixture(liveChildren);

	const html = await render();
	expect(html).toContain(refusedOnPage);
	expect(html).toContain('window.__MARKLESS_DEV_ERROR__ = ');
	expect(html).not.toContain('<div id="app"></div>');
	const [reported] = devErrors(send);
	expect(reported?.diagnostics[0]?.code).toBe('MARKLESS_PROJECTION_LIVE_IN_BRANCH');
	expect(reported?.diagnostics[0]?.message).toMatch(refusal);

	await expect(server.environments.client.transformRequest('/src/middle.tsrx')).rejects.toThrow(refusal);
});

test('static children render in dev', async () => {
	const { send, render } = await startFixture(staticChildren);

	const html = await render();
	expect(html).toContain('<span>Projected</span>');
	expect(html).not.toContain('MARKLESS_PROJECTION_LIVE');
	expect(devErrors(send)).toEqual([]);
});

test('an edit that makes only the outer caller pass live children is refused on the next render, and its revert renders', async () => {
	const { entry, server, send, render } = await startFixture(staticChildren);
	expect(await render()).toContain('<span>Projected</span>');

	const edit = async (children: string) => {
		const reloads = send.mock.calls.length;
		await writeFile(entry, page(children));
		server.watcher.emit('change', entry);
		await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(reloads));
	};

	await edit(liveChildren);
	await vi.waitFor(async () => expect(await render()).toContain(refusedOnPage));
	expect(devErrors(send).at(-1)?.diagnostics[0]?.message).toMatch(refusal);

	await edit(staticChildren);
	await vi.waitFor(async () => expect(await render()).toContain('<span>Projected</span>'));
});
