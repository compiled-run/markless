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

const SOURCE =
	"import { state } from '@markless/core';\n\n" +
	'export default function Counter() @{\n' +
	'\tlet count = state(0);\n' +
	'\t<button onClick={() => count++}>{count}</button>\n}\n';

test('the dev server hands a ?raw import of a .tsrx file its text, not the compiled component', async () => {
	const fixtureRoot = await realpath(await mkdtemp(join(tmpdir(), 'markless-dev-raw-')));
	cleanupRoots.push(fixtureRoot);
	await mkdir(join(fixtureRoot, 'src'), { recursive: true });
	await writeFile(join(fixtureRoot, 'index.html'), '<html><head></head><body></body></html>');
	await writeFile(join(fixtureRoot, 'src', 'counter.tsrx'), SOURCE);
	let server: ViteDevServer | undefined;
	try {
		server = await createServer({
			configFile: false,
			root: fixtureRoot,
			logLevel: 'silent',
			plugins: [markless({ executionLog: 'never' })],
			resolve: { alias: marklessSourceAliases(root) },
			server: { middlewareMode: true, ws: false },
		});
		for (const id of ['/src/counter.tsrx?raw', '/src/counter.tsrx?import&raw']) {
			const result = await server.environments.client.transformRequest(id);
			expect(result?.code, id).toBe(`export default ${JSON.stringify(SOURCE)}`);
		}
	} finally {
		await server?.close();
	}
});
