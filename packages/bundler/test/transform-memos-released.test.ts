import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'pathe';
import { createBuilder, type Plugin } from 'vite';
import { expect, test } from 'vitest';
import { compileCacheSize } from '../../compiler/src/compile-cache.ts';
import { parseCacheStats } from '../../compiler/src/js-ast.ts';
import { markless } from '../../core/src/vite.ts';
import { router } from '../../router/src/vite/index.ts';
import { generateBuildScaleApp } from '../../../scripts/benchmarks/build-scale/generate.mjs';

// On the shadcn port the compile memo and parse cache held about 6.5 GB of the client build's heap after its
// module graph was built; rendering chunks reads neither, so they must not outlive the graph.
test(
	'once an environment has built its module graph, the compile memo and parse cache hold nothing',
	{ timeout: 600_000 },
	async () => {
		const scratch = await realpath(await mkdtemp(join(tmpdir(), 'markless-transform-memos-')));
		try {
			const app = join(scratch, 'app');
			await generateBuildScaleApp({
				dir: app,
				pages: 3,
				components: 4,
				perPage: 2,
				layers: 1,
			});
			const held: Record<string, { compiles: number; parses: number }> = {};
			const probe: Plugin = {
				name: 'transform-memos-probe',
				renderStart() {
					held[this.environment.name] = {
						compiles: compileCacheSize(),
						parses: parseCacheStats().size,
					};
				},
			};
			const builder = await createBuilder({
				root: app,
				configFile: false,
				logLevel: 'silent',
				plugins: [markless(), router(), probe],
			});
			await builder.buildApp();
			expect(Object.keys(held)).toContain('client');
			for (const counts of Object.values(held))
				expect(counts).toEqual({ compiles: 0, parses: 0 });
		} finally {
			await rm(scratch, { recursive: true, force: true });
		}
	},
);
