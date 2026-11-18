// The benchmark guard skips timing only when the two builds of the benchmark app serve the same bytes.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
import { marklessBuildManifestPath } from '../../packages/bundler/src/build/build-manifests.ts';
import {
	collectRenderedModules,
	createByteAttributionAsset,
	MARKLESS_BYTE_ATTRIBUTION,
} from '../../packages/bundler/src/build/byte-attribution.ts';
import { stripBuildPrefix } from '../../packages/bundler/src/virtual-ids.ts';
import { bundleDifferences, bundleDigest } from './jsfb-bundle-digest.mjs';

async function build(
	scratch: string,
	root: string,
	files: Record<string, (root: string, fromApp: string) => string>,
) {
	const app = join(scratch, 'js-framework-benchmark', 'frameworks', 'keyed', 'markless');
	const dist = join(app, 'dist');
	await mkdir(join(dist, 'build'), { recursive: true });
	for (const [name, content] of Object.entries(files)) {
		await writeFile(join(dist, name), content(root, relative(app, root)));
	}
	return bundleDigest(dist, root);
}

const app = {
	'index.html': () => '<script type="module" src="/build/chunk-a.js"></script>',
	'build/chunk-a.js': () => 'export const run = () => 1;',
	'build/execution-sizes.json': (root: string, fromApp: string) =>
		JSON.stringify({
			modules: [`${root}/packages/core/src/index.ts`, `${fromApp}/packages/web/src/index.ts`],
		}),
};

describe('two builds of the benchmark app', () => {
	test('match when the only difference is where each checkout lives', async () => {
		const scratch = await mkdtemp(join(tmpdir(), 'markless-bundle-'));
		const baseline = await build(scratch, join(scratch, 'markless-baseline'), app);
		const current = await build(
			await mkdtemp(join(tmpdir(), 'markless-bundle-')),
			'/home/runner/work/markless/markless',
			app,
		);
		expect(Object.keys(baseline)).toEqual([
			'build/chunk-a.js',
			'build/execution-sizes.json',
			'index.html',
		]);
		expect(bundleDifferences(baseline, current)).toEqual([]);
	});

	test('differ when any served byte or file differs', async () => {
		const scratch = await mkdtemp(join(tmpdir(), 'markless-bundle-'));
		const root = join(scratch, 'markless');
		const baseline = await build(scratch, root, app);
		const changed = await build(await mkdtemp(join(tmpdir(), 'markless-bundle-')), root, {
			...app,
			'build/chunk-a.js': () => 'export const run = () => 2;',
			'build/chunk-b.js': () => '',
		});
		expect(bundleDifferences(baseline, changed)).toEqual([
			'build/chunk-a.js',
			'build/chunk-b.js',
		]);
		const sizes = await build(await mkdtemp(join(tmpdir(), 'markless-bundle-')), root, {
			...app,
			'build/execution-sizes.json': (where: string) =>
				JSON.stringify({ modules: [`${where}/x.ts`] }),
		});
		expect(bundleDifferences(baseline, sizes)).toEqual(['build/execution-sizes.json']);
	});
});

type Chunk = { code: (names: Record<string, string>) => string; modules: string[] };

// Writes the app's chunks under content-hashed names, and the byte attribution the bundler writes beside them.
async function hashedBuild(
	hashes: Record<string, string>,
	chunks: Record<string, Chunk>,
	html: (names: Record<string, string>) => string,
) {
	const root = '/work/markless';
	const dist = join(
		await mkdtemp(join(tmpdir(), 'markless-bundle-')),
		'js-framework-benchmark/frameworks/keyed/markless/dist',
	);
	const names = Object.fromEntries(
		Object.keys(chunks).map((chunk) => [chunk, `chunk-${hashes[chunk]}.js`]),
	);
	const bundle = Object.fromEntries(
		Object.entries(chunks).map(([chunk, { code, modules }]) => {
			const fileName = `build/${names[chunk]}`;
			return [
				fileName,
				{
					type: 'chunk' as const,
					fileName,
					name: 'chunk',
					code: code(names),
					exports: [],
					imports: [],
					dynamicImports: [],
					moduleIds: modules,
					modules: Object.fromEntries(modules.map((id) => [id, { renderedLength: 10 }])),
				},
			];
		}),
	);
	await mkdir(join(dist, 'build'), { recursive: true });
	await writeFile(join(dist, 'index.html'), html(names));
	for (const chunk of Object.values(bundle))
		await writeFile(join(dist, chunk.fileName), chunk.code);
	const attribution = createByteAttributionAsset(
		bundle,
		collectRenderedModules(bundle, root),
		root,
		stripBuildPrefix,
	);
	const metadata = marklessBuildManifestPath(dist, MARKLESS_BYTE_ATTRIBUTION);
	await mkdir(dirname(metadata), { recursive: true });
	await writeFile(metadata, attribution.source);
	return { dist, root, metadata };
}

// A module-free entry facade, and two chunks that import each other, as the benchmark app's runtime chunks do.
const hashedApp: Record<string, Chunk> = {
	entry: { code: (names) => `import{a as e}from"./${names.app}";await e();`, modules: [] },
	app: {
		code: (names) =>
			`import{r as t}from"./${names.runtime}";export const a=()=>t(import("./${names.runtime}"));`,
		modules: ['/work/markless/demos/app/src/main.ts'],
	},
	runtime: {
		code: (names) => `import{a}from"./${names.app}";export const r=(x)=>x;`,
		modules: ['/work/markless/packages/runtime/src/graph.ts'],
	},
};
const entryHtml = (names: Record<string, string>) =>
	`<script type="module" src="./build/${names.entry}"></script>`;

describe('two builds that name their chunks by content hash', () => {
	test('match when only the hashes in chunk names differ', async () => {
		const baseline = await hashedBuild(
			{ entry: 'XAIxIesD', app: 'ZLHPKV_k', runtime: 'S2IOLYaS' },
			hashedApp,
			entryHtml,
		);
		const current = await hashedBuild(
			{ entry: 'D8PoDF3L', app: 'FFeSm6pm', runtime: 'Md3h_dSO' },
			hashedApp,
			entryHtml,
		);
		const before = bundleDigest(baseline.dist, baseline.root);
		expect(Object.keys(before)).not.toContain('build/chunk-ZLHPKV_k.js');
		expect(bundleDifferences(before, bundleDigest(current.dist, current.root))).toEqual([]);
	});

	test("differ when a chunk's code changes, whatever it is named", async () => {
		const baseline = await hashedBuild(
			{ entry: 'XAIxIesD', app: 'ZLHPKV_k', runtime: 'S2IOLYaS' },
			hashedApp,
			entryHtml,
		);
		const current = await hashedBuild(
			{ entry: 'D8PoDF3L', app: 'FFeSm6pm', runtime: 'Md3h_dSO' },
			{
				...hashedApp,
				runtime: {
					...hashedApp.runtime!,
					code: (names) => `import{a}from"./${names.app}";export const r=(x)=>x+1;`,
				},
			},
			entryHtml,
		);
		const differences = bundleDifferences(
			bundleDigest(baseline.dist, baseline.root),
			bundleDigest(current.dist, current.root),
		);
		expect(differences).toHaveLength(1);
		expect(differences[0]).toMatch(/^build\/\[runtime:runtime\/graph [0-9a-f]{12}\]\.js$/);
	});

	test('differ by hashed name when the bundler wrote no chunk metadata', async () => {
		const baseline = await hashedBuild(
			{ entry: 'XAIxIesD', app: 'ZLHPKV_k', runtime: 'S2IOLYaS' },
			hashedApp,
			entryHtml,
		);
		const current = await hashedBuild(
			{ entry: 'D8PoDF3L', app: 'FFeSm6pm', runtime: 'Md3h_dSO' },
			hashedApp,
			entryHtml,
		);
		await rm(current.metadata);
		expect(
			bundleDifferences(
				bundleDigest(baseline.dist, baseline.root),
				bundleDigest(current.dist, current.root),
			),
		).toContain('build/chunk-Md3h_dSO.js');
	});
});
