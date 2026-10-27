import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createBuilder, createLogger, createServer, type Logger } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cleanupRoots: string[] = [];
afterEach(async () => {
	await Promise.all(
		cleanupRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })),
	);
});

const ROOT_SOURCE = `import { state } from '@markless/core';

export function App() @{
	let rows = state(['a', 'b']);
	let other = state(['c']);
	<main>
		<ul>
			@for (const row of rows; index i; key i) {
				<li>{row}</li>
			}
		</ul>
		<ol>
			// markless-allow MARKLESS_REPEAT_KEY_IS_INDEX: the rows are positions on a fixed grid
			@for (const cell of other; index j; key j) {
				<li>{cell}</li>
			}
		</ol>
		<button onClick={() => rows.push('z')}>add</button>
	</main>
}
`;

async function createFixture() {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-compiler-warnings-')));
	cleanupRoots.push(root);
	await mkdir(join(root, 'src'), { recursive: true });
	await writeFile(
		join(root, 'index.html'),
		'<html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
	);
	await writeFile(
		join(root, 'src/main.ts'),
		"import { render } from '@markless/core';\nimport { App } from './root.tsrx';\nawait render(App, { target: document.querySelector('#app')! });\n",
	);
	await writeFile(join(root, 'src/root.tsrx'), ROOT_SOURCE);
	return root;
}

function capturingLogger(): { logger: Logger; warnings: string[] } {
	const warnings: string[] = [];
	const logger = createLogger('silent');
	logger.warn = (message) => void warnings.push(message);
	logger.warnOnce = (message) => void warnings.push(message);
	return { logger, warnings };
}

const keyedByIndex = (warnings: ReadonlyArray<string>) =>
	warnings.filter((message) => message.includes('MARKLESS_REPEAT_KEY_IS_INDEX'));

test('a production build prints each compiler warning once, at its file and line', async () => {
	const root = await createFixture();
	const { logger, warnings } = capturingLogger();
	const builder = await createBuilder({
		configFile: false,
		root,
		customLogger: logger,
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(repoRoot) },
		build: { write: false },
	});
	await builder.buildApp();

	const printed = keyedByIndex(warnings);
	expect(printed).toHaveLength(1);
	expect(printed[0]).toContain('MARKLESS_REPEAT_KEY_IS_INDEX src/root.tsrx:8:');
	expect(printed[0]).toContain('key i identifies each row of rows by its position');
	expect(printed[0]).toContain('https://markless.dev/errors/MARKLESS_REPEAT_KEY_IS_INDEX');
});

test('the dev server prints a warning once across environments, and again after an edit', async () => {
	const root = await createFixture();
	const { logger, warnings } = capturingLogger();
	const server = await createServer({
		configFile: false,
		root,
		customLogger: logger,
		environments: {
			ssr: {
				consumer: 'server',
				build: { rolldownOptions: { input: { prerender: join(root, 'src/root.tsrx') } } },
			},
		},
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(repoRoot) },
		server: { middlewareMode: true, ws: false },
	});
	try {
		for (const environment of [server.environments.client, server.environments.ssr])
			await environment.transformRequest('/src/root.tsrx');
		expect(keyedByIndex(warnings)).toHaveLength(1);
		expect(keyedByIndex(warnings)[0]).toContain('src/root.tsrx:8:');

		await writeFile(join(root, 'src/root.tsrx'), ROOT_SOURCE.replace("['a', 'b']", "['a']"));
		server.environments.client.moduleGraph.invalidateAll();
		await server.environments.client.transformRequest('/src/root.tsrx');
		expect(keyedByIndex(warnings)).toHaveLength(2);
	} finally {
		await server.close();
	}
});

// The build follows `open` to every caller and fails on one that can change it, so a build that ships has proven it fixed.
const PROP_DECIDED_SOURCE = `import { state } from '@markless/core';

function Counter() @{
	let count = state(0);
	<button type="button" onClick={() => count++}>{count}</button>
}

function Panel({ open }) @{
	<section>
		@if (open) {
			<Counter />
		}
	</section>
}

export function App() @{
	<main>
		<Panel open={true} />
	</main>
}
`;

const propDecided = (warnings: ReadonlyArray<string>) =>
	warnings.filter((message) => message.includes('MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED'));

test('a build prints no warning the caller check already proved, and the dev server still does', async () => {
	const root = await createFixture();
	await writeFile(join(root, 'src/root.tsrx'), PROP_DECIDED_SOURCE);
	const built = capturingLogger();
	const builder = await createBuilder({
		configFile: false,
		root,
		customLogger: built.logger,
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(repoRoot) },
		build: { write: false },
	});
	await builder.buildApp();
	expect(propDecided(built.warnings)).toEqual([]);

	const served = capturingLogger();
	const server = await createServer({
		configFile: false,
		root,
		customLogger: served.logger,
		plugins: [markless({ executionLog: 'never' })],
		resolve: { alias: marklessSourceAliases(repoRoot) },
		server: { middlewareMode: true, ws: false },
	});
	try {
		await server.environments.client.transformRequest('/src/root.tsrx');
		expect(propDecided(served.warnings)).toHaveLength(1);
	} finally {
		await server.close();
	}
});
