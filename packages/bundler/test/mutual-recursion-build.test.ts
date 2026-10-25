import { copyFile, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'pathe';
import { createBuilder, createServer } from 'vite';
import { expect, test } from 'vitest';
import { markless } from '../../core/src/vite.ts';
import { router } from '../../router/src/vite/index.ts';

const packagesRoot = fileURLToPath(new URL('../../', import.meta.url));
const cycles = fileURLToPath(new URL('./fixtures/component-import-cycle/', import.meta.url));
const oneFile = fileURLToPath(
	new URL('../../vitest-browser/browser/fixtures/mutual-recursion/', import.meta.url),
);

// Files that render each other link against each other's published symbols, so
// the build used to wait on itself forever at `transforming...` with the CPU idle.
const CYCLES = [
	{ page: 'page', files: ['outer', 'inner'] },
	{ page: 'ring-page', files: ['ring-a', 'ring-b', 'ring-c'] },
	{ page: 'async-page', files: ['async-outer', 'async-inner'] },
	{ page: 'tree-page', files: ['tree-outer', 'tree-inner'] },
] as const;

async function scratchApp(fixtures: string, files: ReadonlyArray<string>, page: string) {
	const root = await realpath(await mkdtemp(join(tmpdir(), 'markless-mutual-recursion-')));
	await mkdir(join(root, 'pages'), { recursive: true });
	await mkdir(join(root, 'components'), { recursive: true });
	await mkdir(join(root, 'node_modules/@markless'), { recursive: true });
	for (const pkg of ['core', 'router'])
		await symlink(join(packagesRoot, pkg), join(root, 'node_modules/@markless', pkg), 'dir');
	await writeFile(join(root, 'package.json'), '{"name":"mutual-recursion","type":"module"}');
	for (const file of [...files, page])
		await copyFile(join(fixtures, `${file}.tsrx`), join(root, 'components', `${file}.tsrx`));
	await writeFile(
		join(root, 'pages/index.tsrx'),
		`import Page from '../components/${page}.tsrx';\n\nexport default function Route() @{\n\t<Page />\n}\n`,
	);
	return root;
}

async function settle<T>(work: Promise<T>): Promise<{ readonly error?: string } | 'stalled'> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			work.then(
				() => ({}),
				(error: unknown) => ({ error: String((error as Error)?.message ?? error) }),
			),
			new Promise<'stalled'>((done) => (timer = setTimeout(() => done('stalled'), 60_000))),
		]);
	} finally {
		clearTimeout(timer);
	}
}

async function build(root: string) {
	const builder = await createBuilder({
		root,
		configFile: false,
		logLevel: 'silent',
		plugins: [markless(), router()],
	});
	return settle(builder.buildApp());
}

test.each(CYCLES)(
	'a build whose files render each other ($files) stops with the cycle named',
	{ timeout: 120_000 },
	async ({ page, files }) => {
		const root = await scratchApp(cycles, files, page);
		try {
			const outcome = await build(root);
			expect(outcome).not.toBe('stalled');
			const error = outcome === 'stalled' ? '' : (outcome.error ?? '');
			expect(error).toContain('MARKLESS_COMPONENT_IMPORT_CYCLE');
			for (const file of files) expect(error).toContain(`components/${file}.tsrx`);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	},
);

test(
	'the dev server answers a page whose files render each other with the cycle, not a hang',
	{ timeout: 120_000 },
	async () => {
		const root = await scratchApp(cycles, ['outer', 'inner'], 'page');
		const server = await createServer({
			root,
			configFile: false,
			logLevel: 'silent',
			plugins: [markless()],
			server: { middlewareMode: true, hmr: false, ws: false },
		});
		try {
			const outcome = await settle(server.transformRequest('/components/page.tsrx'));
			expect(outcome).not.toBe('stalled');
			expect(outcome === 'stalled' ? '' : outcome.error).toContain(
				'MARKLESS_COMPONENT_IMPORT_CYCLE',
			);
		} finally {
			await server.close();
			await rm(root, { recursive: true, force: true });
		}
	},
);

test('components of one file that render each other build', { timeout: 120_000 }, async () => {
	for (const [page, files] of [
		['pair', []],
		['ring', []],
		['async-pair-page', ['async-pair']],
	] as const) {
		const root = await scratchApp(oneFile, files, page);
		try {
			expect(await build(root)).toEqual({});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	}
});
