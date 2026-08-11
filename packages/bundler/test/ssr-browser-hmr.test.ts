import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServer, type HotPayload, type ViteDevServer } from 'vite';
import { markless } from '../src/vite/index.ts';
import {
	MARKLESS_DEV_ERROR_CLEAR_EVENT,
	MARKLESS_DEV_ERROR_CLIENT_ID,
	MARKLESS_DEV_ERROR_EVENT,
} from '../src/dev-error/index.ts';
import { fixtureSsrHost } from '../fixtures/vite-ssr/src/dev-server.ts';

const root = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

describe('SSR browser HMR', () => {
	test('serves the framework error document when dev prerender evaluation throws', async () => {
		const fixture = await createSsrFixture();
		await writeFile(
			fixture.entry,
			"function explode() { throw new Error('dev prerender exploded'); }\n\n" +
				'export function App() @{\n\t<section>{explode()}</section>\n}\n',
		);
		let server: ViteDevServer | undefined;
		vi.stubEnv('MARKLESS_PRERENDER', '1');
		try {
			server = await createServer({
				configFile: false,
				root: fixture.root,
				environments: {
					ssr: {
						consumer: 'server',
						build: { rolldownOptions: { input: { prerender: fixture.entry } } },
					},
				},
				plugins: [markless({ executionLog: 'never' })],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			const html = await server.transformIndexHtml(
				'/',
				'<html><head></head><body><div id="app"></div></body></html>',
			);
			expect(html).toContain('dev prerender exploded');
			expect(html).toContain('window.__MARKLESS_DEV_ERROR__ = ');
			expect(html).toContain(MARKLESS_DEV_ERROR_CLIENT_ID);
			expect(html).not.toContain('<div id="app"></div>');
		} finally {
			vi.unstubAllEnvs();
			await server?.close();
		}
	});

	test('invalidates a prerender snapshot before the edited page reloads', async () => {
		const fixture = await createSsrFixture();
		let server: ViteDevServer | undefined;
		vi.stubEnv('MARKLESS_PRERENDER', '1');
		try {
			server = await createServer({
				configFile: false,
				root: fixture.root,
				environments: {
					ssr: {
						consumer: 'server',
						build: { rolldownOptions: { input: { prerender: fixture.entry } } },
					},
				},
				plugins: [markless({ executionLog: 'never' })],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			const indexHtml =
				'<html><head></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>';
			const first = await server.transformIndexHtml('/', indexHtml);
			expect(first).toContain('<span>hello</span>');
			expect(first).toContain('data-markless-resume-module=');
			expect(first).not.toContain('type="markless/state"');

			const send = vi.spyOn(server.environments.client.hot, 'send');
			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('<span>hello</span>', '<span>fresh render data</span>'),
			);
			await waitForFullReloadCountAbove(send, 0);

			const second = await server.transformIndexHtml('/', indexHtml);
			expect(second).toContain('<span>fresh render data</span>');
			expect(second).not.toContain('<span>hello</span>');
		} finally {
			vi.unstubAllEnvs();
			await server?.close();
		}
	});

	test('reports an invalid real edit without reload and clears it before the corrected reload', async () => {
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

			const send = vi.spyOn(server.environments.client.hot, 'send');
			const html = await requestHtml(server);
			expect(html).toContain(`/@id/__x00__${MARKLESS_DEV_ERROR_CLIENT_ID}`);
			const reloadsBefore = fullReloadCount(send);

			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('</section>', '</section>>'),
			);
			await vi.waitFor(() => {
				const message = customMessages(send, MARKLESS_DEV_ERROR_EVENT).at(-1);
				expect(message?.data).toMatchObject({
					version: 1,
					id: fixture.entry,
					kind: 'compile',
				});
			});
			expect(fullReloadCount(send)).toBe(reloadsBefore);

			await editFile(server, fixture.entry, fixture.source.replace('count++', 'count += 4'));
			await vi.waitFor(() => {
				const clearIndex = send.mock.calls.findIndex(
					([message]) =>
						(message as { type?: string; event?: string }).type === 'custom' &&
						(message as { event?: string }).event === MARKLESS_DEV_ERROR_CLEAR_EVENT,
				);
				const reloadIndex = send.mock.calls.findIndex(
					([message], index) =>
						index > clearIndex &&
						(message as HotPayload | undefined)?.type === 'full-reload',
				);
				expect(clearIndex).toBeGreaterThan(-1);
				expect(reloadIndex).toBeGreaterThan(clearIndex);
			});
			expect(customMessages(send, MARKLESS_DEV_ERROR_EVENT)).toHaveLength(1);
			expect(customMessages(send, MARKLESS_DEV_ERROR_CLEAR_EVENT)).toHaveLength(1);
			expect(fullReloadCount(send) - reloadsBefore).toBe(1);
		} finally {
			await server?.close();
		}
	});

	test('clears an invalid edit when restoring the original bytes emits no watcher update', async () => {
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

			const send = vi.spyOn(server.environments.client.hot, 'send');
			await requestHtml(server);
			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('</section>', '</section>>'),
			);
			await vi.waitFor(() => {
				expect(customMessages(send, MARKLESS_DEV_ERROR_EVENT).at(-1)?.data).toMatchObject({
					id: fixture.entry,
					kind: 'compile',
				});
			});

			const messagesBeforeRestore = send.mock.calls.length;
			await writeFile(fixture.entry, fixture.source);
			await vi.waitFor(
				() => {
					const restoredMessages = send.mock.calls.slice(messagesBeforeRestore);
					const clearIndex = restoredMessages.findIndex(
						([message]) =>
							(message as { type?: string; event?: string }).type === 'custom' &&
							(message as { event?: string }).event ===
								MARKLESS_DEV_ERROR_CLEAR_EVENT,
					);
					const reloadIndex = restoredMessages.findIndex(
						([message], index) =>
							index > clearIndex &&
							(message as HotPayload | undefined)?.type === 'full-reload',
					);
					expect(clearIndex).toBeGreaterThan(-1);
					expect(reloadIndex).toBeGreaterThan(clearIndex);
				},
				{ timeout: 2_000 },
			);
		} finally {
			await server?.close();
		}
	});

	test('serves the added element after a structural edit to an imported component', async () => {
		const fixture = await createComponentSsrFixture();
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

			const send = vi.spyOn(server.environments.client.hot, 'send');
			const first = await requestHtml(server);
			expect(first).toContain('child original');
			expect(first).not.toContain('child added');
			expect(marklessViewPayload(first).locators).toHaveLength(5);

			await editFile(
				server,
				fixture.child,
				fixture.childSource.replace(
					'\t</section>',
					'\t\t<em data-child-added onClick={() => clicks += 2}>child added</em>\n\t</section>',
				),
			);
			await waitForFullReloadCountAbove(send, 0);

			const second = await requestHtml(server);
			expect(second).toContain('data-child-added');
			expect(second).toContain('child added');
			const view = marklessViewPayload(second);
			expect(view.locators.map((locator) => locator.tagName)).toContain('em');
			expect(view.events).toHaveLength(3);
		} finally {
			await server?.close();
		}
	});

	test('serves the edited component to a render started on the reload signal', async () => {
		const fixture = await createComponentSsrFixture();
		let server: ViteDevServer | undefined;
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: { ssr: { build: { rolldownOptions: { input: fixture.entry } } } },
				plugins: [markless(), fixtureSsrHost(), slowServerHotUpdate(200)],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			// Vite page-reloads a changed index.html, and the fixture's setup writes arrive late.
			server.watcher.unwatch(fixture.root);

			const send = vi.spyOn(server.environments.client.hot, 'send');
			expect(await requestHtml(server)).toContain('child original');

			// A browser reloads the instant the client environment's hotUpdate pass
			// sends its signal, which is before any server environment's pass has
			// run. That render must not serve the modules the edit replaced.
			let reloaded: Promise<string> | undefined;
			const reloadingServer = server;
			send.mockImplementation((payload) => {
				if ((payload as HotPayload | undefined)?.type === 'full-reload' && !reloaded) {
					reloaded = requestHtml(reloadingServer);
				}
			});

			await editFile(
				server,
				fixture.child,
				fixture.childSource.replace(
					'\t</section>',
					'\t\t<em data-child-added>child added</em>\n\t</section>',
				),
			);
			await waitForFullReloadCountAbove(send, 0);

			expect(reloaded).toBeDefined();
			expect(await reloaded).toContain('data-child-added');
		} finally {
			await server?.close();
		}
	});

	test('serves the edited component to an unbarriered render started on the reload signal', async () => {
		const fixture = await createComponentSsrFixture();
		let server: ViteDevServer | undefined;
		vi.stubEnv('MARKLESS_NO_BARRIER', '1');
		try {
			server = await createServer({
				configFile: false,
				mode: 'ssr',
				root: fixture.root,
				environments: { ssr: { build: { rolldownOptions: { input: fixture.entry } } } },
				plugins: [markless(), fixtureSsrHost(), slowServerHotUpdate(200)],
				resolve: { alias: marklessSourceAliases() },
				server: { hmr: true, middlewareMode: true, ws: false },
			});

			// Vite page-reloads a changed index.html, and the fixture's setup writes arrive late.
			server.watcher.unwatch(fixture.root);

			const send = vi.spyOn(server.environments.client.hot, 'send');
			expect(await requestHtml(server)).toContain('child original');

			// The escape hatch drops the wait that holds renders during a pass, so the
			// only thing that can keep this render off the pre-edit modules is the first
			// pass having invalidated every environment before it sent the reload.
			let reloaded: Promise<string> | undefined;
			const reloadingServer = server;
			send.mockImplementation((payload) => {
				if ((payload as HotPayload | undefined)?.type === 'full-reload' && !reloaded) {
					reloaded = requestHtml(reloadingServer);
				}
			});

			await editFile(
				server,
				fixture.child,
				fixture.childSource.replace(
					'\t</section>',
					'\t\t<em data-child-added>child added</em>\n\t</section>',
				),
			);
			await waitForFullReloadCountAbove(send, 0);

			expect(reloaded).toBeDefined();
			expect(await reloaded).toContain('data-child-added');
		} finally {
			vi.unstubAllEnvs();
			await server?.close();
		}
	});

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

			await editFile(
				server,
				fixture.entry,
				fixture.source.replace('count++', 'count = count + 1'),
			);
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
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-ssr-hmr-')));
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

function marklessViewPayload(html: string) {
	const match = html.match(/<script type="markless\/view">([\s\S]*?)<\/script>/);
	expect(match).not.toBeNull();
	return JSON.parse(match![1]) as {
		locators: { tagName?: string }[];
		events: unknown[];
	};
}

async function createComponentSsrFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-ssr-hmr-child-')));
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

	return { child, childSource, entry, root, source };
}

// Puts the server environment's hotUpdate pass behind the client one by the
// margin a loaded machine produces, so the reload signal reliably lands before
// the edited modules are invalidated.
function slowServerHotUpdate(delayMs: number) {
	return {
		name: 'test-slow-server-hot-update',
		async hotUpdate(this: { environment: { name: string } }) {
			if (this.environment.name === 'client') return;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
		},
	};
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

function fullReloadCount(send: ReturnType<typeof vi.spyOn>) {
	return send.mock.calls.filter(
		([payload]) => (payload as HotPayload | undefined)?.type === 'full-reload',
	).length;
}

function customMessages(send: ReturnType<typeof vi.spyOn>, event: string) {
	return send.mock.calls
		.map(([message]) => message as { type?: string; event?: string; data?: unknown })
		.filter((message) => message.type === 'custom' && message.event === event);
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
