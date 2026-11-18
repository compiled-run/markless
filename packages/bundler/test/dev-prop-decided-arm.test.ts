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

// The @if tests a prop, and its content holds a nested @if, which compiled markup cannot rebuild.
const block = `
import { state } from '@markless/core';

export function NoteBlock({ open }: { readonly open: boolean }) @{
	let deep = state(false);
	<p>
		@if (open) {
			<span data-note>
				<button type="button" data-deeper onClick={() => (deep = !deep)}>More</button>
				@if (deep) {
					<em data-deep>More</em>
				}
			</span>
		} @else {
			<span data-closed>closed</span>
		}
	</p>
}
`;

const page = (open: string) => `
import { state } from '@markless/core';
import { NoteBlock } from './block.tsrx';

function Row({ id }: { readonly id: number }) @{
	let note = state(false);
	<li>
		<button type="button" data-expand onClick={() => (note = !note)}>Note {id}</button>
		<NoteBlock open={${open}} />
	</li>
}

export function App() @{
	let ids = state([1, 2]);
	<main>
		<ul>
			@for (const id of ids; key id) {
				<Row id={id} />
			}
		</ul>
	</main>
}
`;

async function startFixture(open: string) {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-prop-decided-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(join(src, 'block.tsrx'), block);
	const entry = join(src, 'root.tsrx');
	await writeFile(entry, page(open));
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
	/MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: .*block\.tsrx: <NoteBlock>: this @if \(open\) cannot be rebuilt when open changes because it holds a branch binding\. Its test reads the prop `open`, and <Row> in .*root\.tsrx passes it `note`, which changes\./;

test('the dev server refuses a row child whose prop-decided @if a caller changes, served and in the client, with the build message', async () => {
	const { send, render, server } = await startFixture('note');

	const html = await render();
	expect(html).toContain('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: ');
	expect(html).not.toContain('<div id="app"></div>');
	const [reported] = devErrors(send);
	expect(reported?.diagnostics[0]?.code).toBe('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED');
	expect(reported?.diagnostics[0]?.message).toMatch(refusal);

	await expect(server.environments.client.transformRequest('/src/root.tsrx')).rejects.toThrow(refusal);
});

test('a caller that passes only a fixed value renders in dev', async () => {
	const { send, render, server } = await startFixture('true');

	const html = await render();
	expect(html).toContain('data-note');
	expect(html).not.toContain('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED');
	expect(devErrors(send)).toEqual([]);
	await expect(server.environments.client.transformRequest('/src/root.tsrx')).resolves.toBeTruthy();
});

test('an edit that makes the caller pass state is refused on the next render, and its revert renders', async () => {
	const { entry, server, send, render } = await startFixture('true');
	expect(await render()).toContain('data-note');

	const edit = async (open: string) => {
		const reloads = send.mock.calls.length;
		await writeFile(entry, page(open));
		server.watcher.emit('change', entry);
		await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThan(reloads));
	};

	await edit('note');
	await vi.waitFor(async () => expect(await render()).toContain('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED: '));
	expect(devErrors(send).at(-1)?.diagnostics[0]?.message).toMatch(refusal);

	await edit('true');
	await vi.waitFor(async () => expect(await render()).toContain('data-note'));
});
