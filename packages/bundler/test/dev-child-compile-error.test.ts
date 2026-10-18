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

async function createFixture() {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-child-error-')));
	cleanupRoots.push(fixtureRoot);
	const src = join(fixtureRoot, 'src');
	await mkdir(src, { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(
		join(src, 'child.tsrx'),
		"import { state } from '@markless/core';\n\n" +
			'export default function Child() @{\n' +
			'\tlet keys = state(0);\n' +
			'\t<input onKeydown={(event) => {\n' +
			"\t\tif (event.key === 'Enter') event.preventDefault();\n" +
			'\t\tsetTimeout(() => event.stopPropagation(), 0);\n' +
			'\t\tkeys++;\n' +
			'\t}} />\n}\n',
	);
	const entry = join(src, 'root.tsrx');
	await writeFile(
		entry,
		"import { state } from '@markless/core';\n" +
			"import Child from './child.tsrx';\n\n" +
			'export function App() @{\n' +
			'\tlet count = state(0);\n\n' +
			'\t<main>\n\t\t<button onClick={() => count++}>{count}</button>\n' +
			'\t\t<Child />\n\t</main>\n}\n',
	);
	return { entry, root: fixtureRoot };
}

test("the dev server reports a child's compile error, not the missing metadata or unsealed claims it leaves behind", async () => {
	const fixture = await createFixture();
	let server: ViteDevServer | undefined;
	try {
		server = await createServer({
			configFile: false,
			root: fixture.root,
			logLevel: 'silent',
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
		const failureOf = (promise: Promise<unknown>) =>
			promise.then(
				() => undefined,
				(error: unknown) => (error instanceof Error ? error.message : String(error)),
			);
		// The browser asks for the page and its child at once, as a first page load does.
		const messages = (
			await Promise.all(
				[server.environments.ssr, server.environments.client].flatMap((environment) =>
					['/src/root.tsrx', '/src/child.tsrx', '/src/root.tsrx?markless-symbols'].map(
						(id) => failureOf(environment.transformRequest(id)),
					),
				),
			)
		).filter((message): message is string => message !== undefined);
		expect(messages.length).toBeGreaterThan(0);
		for (const message of messages) {
			expect(message).toContain('MARKLESS_SYNC_POLICY_SECOND_CANCEL');
		}
	} finally {
		await server?.close();
	}
});
