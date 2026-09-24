import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, relative, resolve } from 'pathe';
import { rolldown, type Plugin } from 'rolldown';
import { afterAll, describe, expect, test } from 'vitest';
import {
	renameChunksToContentHashes,
	staleContentHashNames,
} from '../src/build/content-hash-names.ts';

const exec = promisify(execFile);
const buildScript = resolve(import.meta.dirname, 'helpers/build-edited-fixture.ts');
const workDirs: string[] = [];
afterAll(() => Promise.all(workDirs.map((path) => rm(path, { force: true, recursive: true }))));

type TestChunk = {
	type: 'chunk';
	fileName: string;
	preliminaryFileName: string;
	name: string;
	code: string;
	imports: string[];
	dynamicImports: string[];
	moduleIds: string[];
	sourcemapFileName?: string | null;
};

function chunk(
	fileName: string,
	placeholder: string,
	code: string,
	extra: Partial<TestChunk> = {},
): TestChunk {
	return {
		type: 'chunk',
		fileName,
		preliminaryFileName: fileName.replace(/chunk-[\w-]{8}/, `chunk-${placeholder}`),
		name: 'chunk',
		code,
		imports: [],
		dynamicImports: [],
		moduleIds: [],
		...extra,
	};
}

// A resolver table names another chunk's URL as a string: Rolldown's hash never covered it.
function tableBundle(targetName: string, targetCode: string) {
	return {
		'build/chunk-TABLE000.js': chunk(
			'build/chunk-TABLE000.js',
			'!~{001}~',
			`const urls=["./${targetName.slice(6)}"];export const load=(i)=>import(urls[i]);`,
			{ moduleIds: ['/app/table.js'] },
		),
		[targetName]: chunk(targetName, '!~{002}~', targetCode, { moduleIds: ['/app/handler.js'] }),
	};
}

describe('chunk names follow final bytes', () => {
	test('a URL written into a chunk after naming renames that chunk', async () => {
		const before = tableBundle('build/chunk-TARGET01.js', 'export const run=()=>1;');
		const after = tableBundle('build/chunk-TARGET02.js', 'export const run=()=>2;');
		await renameChunksToContentHashes(before);
		await renameChunksToContentHashes(after);
		const table = (bundle: Record<string, TestChunk>) =>
			Object.values(bundle).find((item) => item.moduleIds.includes('/app/table.js'))!;
		const target = (bundle: Record<string, TestChunk>) =>
			Object.values(bundle).find((item) => item.moduleIds.includes('/app/handler.js'))!;

		expect(table(before).fileName).not.toBe(table(after).fileName);
		expect(table(after).code).toContain(`"./${target(after).fileName.slice(6)}"`);
		expect(table(after).fileName).toMatch(/^build\/chunk-[A-Za-z0-9_-]{8}\.js$/);
		expect(await staleContentHashNames(after)).toEqual([]);
	});

	test('names depend on bytes only, not on the names Rolldown picked', async () => {
		const first = tableBundle('build/chunk-TARGET01.js', 'export const run=()=>1;');
		const second = tableBundle('build/chunk-OTHER999.js', 'export const run=()=>1;');
		second['build/chunk-TABLE000.js'].fileName = 'build/chunk-TABLE999.js';
		await renameChunksToContentHashes(first);
		await renameChunksToContentHashes(second);
		const names = (bundle: Record<string, TestChunk>) =>
			Object.values(bundle)
				.map((item) => item.fileName)
				.sort();
		expect(names(second)).toEqual(names(first));
	});

	test('import cycles hash as one unit and code edits after renaming are reported', async () => {
		const cycle = () => ({
			'build/chunk-AAAAAAAA.js': chunk(
				'build/chunk-AAAAAAAA.js',
				'!~{001}~',
				'import{b}from"./chunk-BBBBBBBB.js";export const a=()=>b;',
				{ imports: ['build/chunk-BBBBBBBB.js'], moduleIds: ['/app/a.js'] },
			),
			'build/chunk-BBBBBBBB.js': chunk(
				'build/chunk-BBBBBBBB.js',
				'!~{002}~',
				'import{a}from"./chunk-AAAAAAAA.js";export const b=()=>a;',
				{ imports: ['build/chunk-AAAAAAAA.js'], moduleIds: ['/app/b.js'] },
			),
		});
		const first = cycle();
		const second = cycle();
		await renameChunksToContentHashes(first);
		await renameChunksToContentHashes(second);
		const [a, b] = Object.values(first);
		expect(Object.values(second).map((item) => item.fileName)).toEqual([
			a!.fileName,
			b!.fileName,
		]);
		expect(a!.imports).toEqual([b!.fileName]);
		expect(b!.imports).toEqual([a!.fileName]);
		expect(a!.code).toContain(`"./${b!.fileName.slice(6)}"`);
		expect(await staleContentHashNames(first)).toEqual([]);

		a!.code += '\n// late edit';
		const stale = await staleContentHashNames(first);
		expect(stale.map((entry) => entry.fileName)).toContain(a!.fileName);
	});

	test('rewrites import lists, text assets and source maps; leaves unhashed names alone', async () => {
		const bundle: Record<string, unknown> = {
			'entry.js': {
				...chunk('entry.js', '', 'import("./build/chunk-LAZY0001.js");'),
				preliminaryFileName: 'entry.js',
				dynamicImports: ['build/chunk-LAZY0001.js'],
			},
			'build/chunk-LAZY0001.js': chunk(
				'build/chunk-LAZY0001.js',
				'!~{001}~',
				'export const x=1;\n//# sourceMappingURL=chunk-LAZY0001.js.map',
				{ sourcemapFileName: 'build/chunk-LAZY0001.js.map' },
			),
			'build/chunk-LAZY0001.js.map': {
				type: 'asset',
				fileName: 'build/chunk-LAZY0001.js.map',
				source: '{"file":"chunk-LAZY0001.js"}',
			},
			'index.html': {
				type: 'asset',
				fileName: 'index.html',
				source: '<link rel="modulepreload" href="/build/chunk-LAZY0001.js">',
			},
		};
		const renames = await renameChunksToContentHashes(bundle);
		const next = renames.get('build/chunk-LAZY0001.js')!;
		const file = next.slice(6);
		const entry = bundle['entry.js'] as TestChunk;
		const lazy = bundle['build/chunk-LAZY0001.js'] as TestChunk;
		const map = bundle['build/chunk-LAZY0001.js.map'] as { fileName: string; source: string };

		expect(entry.fileName).toBe('entry.js');
		expect(entry.code).toBe(`import("./build/${file}");`);
		expect(entry.dynamicImports).toEqual([next]);
		expect(lazy.code).toContain(`sourceMappingURL=${file}.map`);
		expect(map.fileName).toBe(`${next}.map`);
		expect(lazy.sourcemapFileName).toBe(`${next}.map`);
		expect(map.source).toBe(`{"file":"${file}"}`);
		expect((bundle['index.html'] as { source: string }).source).toContain(`/build/${file}"`);
	});

	test('hash characters and length follow the output pattern', async () => {
		const bundle = {
			'assets/chunk-0123456789.js': {
				...chunk('assets/chunk-0123456789.js', '', 'export const y=2;'),
				preliminaryFileName: 'assets/chunk-!~{00000}~.js',
			},
		};
		await renameChunksToContentHashes(bundle, { hashCharacters: 'hex' });
		expect(Object.values(bundle)[0]!.fileName).toMatch(/^assets\/chunk-[0-9a-f]{10}\.js$/);
	});
});

describe('rolldown carries renames to the written output', () => {
	async function write(lazySource: string) {
		const dir = await mkdtemp(join(tmpdir(), 'markless-content-names-'));
		workDirs.push(dir);
		const sources: Record<string, string> = {
			entry: 'export const load = () => import("lazy"); export const table = ["LAZY_URL"];',
			lazy: lazySource,
		};
		const lateTable: Plugin = {
			name: 'late-table',
			async generateBundle(output, bundle) {
				const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
				const lazy = chunks.find((item) => !item.isEntry)!;
				const entry = chunks.find((item) => item.isEntry)!;
				entry.code = entry.code.replace('LAZY_URL', `./${lazy.fileName}`);
				await renameChunksToContentHashes(bundle, {
					hashCharacters: output.hashCharacters,
				});
			},
			async writeBundle(output, bundle) {
				expect(
					await staleContentHashNames(bundle, { hashCharacters: output.hashCharacters }),
				).toEqual([]);
			},
		};
		const build = await rolldown({
			input: 'entry',
			plugins: [
				{
					name: 'sources',
					resolveId: (id) => (id in sources ? id : null),
					load: (id) => sources[id],
				},
				lateTable,
			],
		});
		try {
			await build.write({
				dir,
				entryFileNames: 'chunk-[hash].js',
				chunkFileNames: 'chunk-[hash].js',
			});
		} finally {
			await build.close();
		}
		return readTree(dir);
	}

	test('a late rewrite changes the carrying file name, never its bytes under the old name', async () => {
		const before = await write('export const value = 1;');
		const after = await write('export const value = 2;');
		expect(sameNameDifferentBytes(before, after)).toEqual([]);
		expect([...after.keys()].filter((name) => !before.has(name))).toHaveLength(2);
		const [entryName] = [...after].find(([, code]) => code.includes('import('))!;
		const lazyName = [...after.keys()].find((name) => name !== entryName)!;
		expect(after.get(entryName)).toContain(`./${lazyName}`);
	});
});

describe('fixture rebuilds: a file name never changes its bytes', () => {
	// Enough handlers for a string-list resolver table; the edit lands in a module one handler
	// imports, so every symbol id stays put and only that table's URL strings change.
	const handlers = 6;
	const root = [
		"import { state } from '@markless/core';",
		...Array.from(
			{ length: handlers },
			(_, index) => `import { step${index} } from './step${index}.ts';`,
		),
		'',
		'export function App() @{',
		'\tlet count = state(0);',
		'',
		'\t<main>',
		...Array.from(
			{ length: handlers },
			(_, index) =>
				`\t\t<button type="button" data-step="${index}" onClick={() => (count += step${index}())}>{count}</button>`,
		),
		'\t</main>',
		'}',
		'',
	].join('\n');
	const files = (amount: number) =>
		JSON.stringify({
			'src/root.tsrx': root,
			...Object.fromEntries(
				Array.from({ length: handlers }, (_, index) => [
					`src/step${index}.ts`,
					`export function step${index}() {\n\treturn ${index === 0 ? amount : index};\n}\n`,
				]),
			),
		});

	// Module paths feed symbol ids, so every build of one variant reuses one directory.
	async function buildFixture(dir: string, variant: string, withEdit: boolean) {
		await exec(
			'node',
			[
				'--experimental-strip-types',
				buildScript,
				'vite-csr',
				dir,
				variant,
				files(withEdit ? 2 : 1),
			],
			{ cwd: resolve(import.meta.dirname, '..') },
		);
		return readTree(resolve(dir, 'dist'), (name) => /\.(?:js|css)$/.test(name));
	}

	for (const variant of ['off', 'packs', 'closures']) {
		test(`${variant}: an edit below a handler renames every file whose bytes changed`, async () => {
			const dir = await mkdtemp(join(tmpdir(), `markless-stable-names-${variant}-`));
			workDirs.push(dir);
			const base = await buildFixture(dir, variant, false);
			const edited = await buildFixture(dir, variant, true);
			expect([...edited.keys()].some((name) => !base.has(name))).toBe(true);
			expect(sameNameDifferentBytes(base, edited)).toEqual([]);
			const again = await buildFixture(dir, variant, false);
			expect([...again]).toEqual([...base]);
		}, 240_000);
	}
});

async function readTree(root: string, include: (name: string) => boolean = () => true) {
	const files = new Map<string, string>();
	const walk = async (dir: string): Promise<void> => {
		for (const entry of await readdir(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) await walk(path);
			else if (include(entry.name))
				files.set(relative(root, path), await readFile(path, 'utf8'));
		}
	};
	await walk(root);
	return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function sameNameDifferentBytes(before: Map<string, string>, after: Map<string, string>) {
	return [...after]
		.filter(([name, code]) => before.has(name) && before.get(name) !== code)
		.map(([name]) => name);
}
