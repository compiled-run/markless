import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServer, type HotPayload, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import { fixtureSsrHost } from '../fixtures/vite-ssr/src/dev-server.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe('SSR browser HMR', () => {
	test('sends full reloads for repeated TSRX edits after the page is refetched', async () => {
		const fixture = await createSsrFixture();
		let server: ViteDevServer | undefined;
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: {
					ssr: {
						build: { rolldownOptions: { input: fixture.entry } },
					},
				},
				plugins: [markless(), fixtureSsrHost()],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			const send = vi.spyOn(server.environments.client.hot, 'send');
			await requestHtml(server);

			await editFile(server, fixture.entry, fixture.source.replace('count++', 'count = count + 1'));
			const firstReloads = await waitForFullReloadCountAbove(send, 0);

			await requestHtml(server);

			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('count++', 'count = count + 2'),
				// Browser reloads can leave the client environment tracking the
				// resume-source request rather than the bare TSRX module.
				`${fixture.entry}?markless-resume`,
			);
			await waitForFullReloadCountAbove(send, firstReloads);
		} finally {
			await server?.close();
		}
	});
});

async function createSsrFixture() {
	const root = await mkdtemp(join(tmpdir(), 'markless-ssr-hmr-'));
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
	expect(await response.text()).toContain('/@vite/client');
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
		{ find: '@markless/bundler/rolldown', replacement: repo('packages/bundler/src/rolldown.ts') },
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
