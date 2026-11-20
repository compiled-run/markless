import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createBuilder, type Plugin } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

// A client build that compiles a @for keyed by fields joined into a string runs once more with the key-joining
// runtime; an app with no such key builds once, and its bundle leaves the key-joining module out.
const repoRoot = resolve(import.meta.dirname, '../../..');
const roots: string[] = [];
afterEach(async () => {
	await Promise.all(roots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

const page = (key: string) => `import { state } from '@markless/core';

export function App() @{
	let seats = state([{ row: 'b', n: 2 }, { row: 'a', n: 1 }]);
	<main>
		<button onClick={() => (seats = [...seats].reverse())}>flip</button>
		<ol>
			@for (const seat of seats; key ${key}) {
				<li>{seat.row}</li>
			}
		</ol>
	</main>
}
`;

async function build(key: string) {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-joined-keys-')));
	roots.push(root);
	await mkdir(join(root, 'src'), { recursive: true });
	await writeFile(
		join(root, 'index.html'),
		'<html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>',
	);
	await writeFile(
		join(root, 'src/main.ts'),
		"import { render } from '@markless/core';\nimport { App } from './root.tsrx';\nawait render(App, { target: document.querySelector('#app')! });\n",
	);
	await writeFile(join(root, 'src/root.tsrx'), page(key));
	const builds: string[][] = [];
	const watch: Plugin = {
		name: 'client-builds',
		applyToEnvironment: (environment) => environment.config.consumer === 'client',
		generateBundle(_options, bundle) {
			builds.push(
				Object.values(bundle).flatMap((output) => (output.type === 'chunk' ? output.moduleIds : [])),
			);
		},
	};
	const builder = await createBuilder({
		configFile: false,
		root,
		logLevel: 'silent',
		plugins: [markless({ executionLog: 'never' }), watch],
		resolve: { alias: marklessSourceAliases(repoRoot) },
		build: { write: false },
	});
	await builder.buildApp();
	return builds;
}

const joinsKeys = (moduleIds: ReadonlyArray<string>) =>
	moduleIds.some((id) => id.endsWith('/packages/web/src/repeat-key-parts.ts'));

test('an app whose @for keys are paths on the item builds its client once, without the key-joining runtime', async () => {
	const builds = await build('seat.row');
	expect(builds).toHaveLength(1);
	expect(joinsKeys(builds[0]!)).toBe(false);
});

test('an app with a @for keyed by fields joined into a string builds its client again with the key-joining runtime', async () => {
	const builds = await build('`${seat.row}${seat.n}`');
	expect(builds).toHaveLength(2);
	expect(joinsKeys(builds[0]!)).toBe(false);
	expect(joinsKeys(builds[1]!)).toBe(true);
});
