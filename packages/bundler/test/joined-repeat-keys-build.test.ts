import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { createBuilder, type Plugin } from 'vite';
import { markless } from '../src/vite/index.ts';
import { marklessSourceAliases } from './helpers.ts';

// A client build that compiles a @for keyed by fields joined into a string runs once more with the key-joining
// runtime; an app with no such key builds once, with the key-joining branches folded away.
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
	// What each client build defined the flag the key-joining branches fold on.
	const builds: unknown[] = [];
	const watch: Plugin = {
		name: 'client-builds',
		enforce: 'post',
		applyToEnvironment: (environment) => environment.config.consumer === 'client',
		options: {
			order: 'post',
			handler(options) {
				builds.push(
					(options as { transform?: { define?: Record<string, string> } }).transform?.define
						?.__MARKLESS_JOINED_KEYS__,
				);
			},
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

test('an app whose @for keys are paths on the item builds its client once, without the key-joining runtime', async () => {
	expect(await build('seat.row')).toEqual(['false']);
});

test('an app with a @for keyed by fields joined into a string builds its client again with the key-joining runtime', async () => {
	expect(await build('`${seat.row}${seat.n}`')).toEqual(['false', 'true']);
});
