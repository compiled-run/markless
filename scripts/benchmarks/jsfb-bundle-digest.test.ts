// The benchmark guard skips timing only when the two builds of the benchmark app serve the same bytes.
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, test } from 'vitest';
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
