import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'pathe';
import { build, createBuilder } from 'vite';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { markless } from '../src/vite/index.ts';
import { router } from '../../router/src/vite/index.ts';

// Store writes land slowly, as they do on a loaded machine.
vi.mock('node:fs/promises', async (original) => {
	const fs = await original<typeof import('node:fs/promises')>();
	return {
		...fs,
		rename: async (from: string, to: string) => {
			if (String(to).includes('markless-compile'))
				await new Promise((done) => setTimeout(done, 1_500));
			return fs.rename(from, to);
		},
	};
});

const packagesRoot = fileURLToPath(new URL('../../', import.meta.url));
const workers = process.env.MARKLESS_COMPILE_WORKERS;
beforeAll(() => {
	// Compiles on the calling thread write through the build's store, the writes a failed build left behind.
	process.env.MARKLESS_COMPILE_WORKERS = '0';
});
afterAll(() => {
	if (workers === undefined) delete process.env.MARKLESS_COMPILE_WORKERS;
	else process.env.MARKLESS_COMPILE_WORKERS = workers;
});

const files: Record<string, string> = {
	'components/Broken.tsrx': [
		"import { state } from '@markless/core';",
		'export function Broken() @{',
		"\tconst s = state({ picked: 'mon' });",
		"\tlet days = ['mon', 'tue'];",
		"\tif (s.picked === 'sun') days = ['sun'];",
		'\t<ol>@for (const day of days; key day) { <li data-picked={s.picked}>{day}</li> }</ol>',
		'}',
	].join('\n'),
	'components/Fine.tsrx': [
		"import { state } from '@markless/core';",
		'export function Fine() @{',
		'\tlet count = state(0);',
		'\t<button onClick={() => count++}>{count}</button>',
		'}',
	].join('\n'),
	'pages/index.tsrx': [
		"import { Fine } from '../components/Fine.tsrx';",
		"import { Broken } from '../components/Broken.tsrx';",
		'export default function Home() @{',
		'\t<main><Fine /><Broken /></main>',
		'}',
	].join('\n'),
};

const listing = async (directory: string) =>
	(await readdir(directory, { recursive: true }).catch(() => [] as string[])).sort();

async function scratchApp(sources: Record<string, string>) {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-build-store-')));
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const name of ['core', 'router'])
		await symlink(join(packagesRoot, name), join(root, 'node_modules/@markless', name), 'dir');
	for (const [file, source] of Object.entries(sources)) {
		await mkdir(join(root, file, '..'), { recursive: true });
		await writeFile(join(root, file), source);
	}
	return root;
}

// Whatever lands after the build settles races the caller removing or reading the store.
async function expectStoreSettled(root: string) {
	const store = join(root, 'node_modules/.vite/markless-compile');
	const settled = await listing(store);
	expect(settled.some((name) => name.endsWith('.bin'))).toBe(true);
	expect(settled.filter((name) => name.endsWith('.tmp'))).toEqual([]);
	await new Promise((done) => setTimeout(done, 2_000));
	expect(await listing(store)).toEqual(settled);
}

test(
	'a failed build has written its compile store before it rejects',
	{ timeout: 120_000 },
	async () => {
		const root = await scratchApp(files);
		try {
			const builder = await createBuilder({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [markless(), router()],
			});
			await expect(builder.buildApp()).rejects.toThrow(/MARKLESS_/);
			await expectStoreSettled(root);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
);

test(
	'a build run without buildApp has written its compile store before it resolves',
	{ timeout: 120_000 },
	async () => {
		const root = await scratchApp({
			'index.html': '<div id="app"></div><script type="module" src="/main.ts"></script>',
			'main.ts': [
				"import { render } from '@markless/core';",
				"import { Fine } from './components/Fine.tsrx';",
				"await render(Fine, { target: document.querySelector('#app')! });",
			].join('\n'),
			'components/Fine.tsrx': files['components/Fine.tsrx']!,
		});
		try {
			await build({
				root,
				configFile: false,
				logLevel: 'silent',
				build: { write: false },
				plugins: [markless()],
			});
			await expectStoreSettled(root);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
);
