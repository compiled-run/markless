import { expect, test } from 'vitest';
import { createBuildMetadata } from '../src/build/build-metadata.ts';
import { MARKLESS_BUNDLE_GRAPH } from '../src/build/chunking.ts';
import { collectModulePreloadInjections } from '../src/build/head-links.ts';

test('wake wrapper preloads close over generated demand-router symbol routes', () => {
	const metadata = createBuildMetadata(
		{
			'build/wake.js': chunk({
				fileName: 'build/wake.js',
				code: 'export const wake = () => import("./demand-router.js");',
				dynamicImports: ['build/demand-router.js'],
			}),
			'build/demand-router.js': chunk({
				fileName: 'build/demand-router.js',
				code: [
					'const table = [1,null,null,["./interaction.js"],["onInteract"],{"symbol:0":[0,0]}];',
					'export function loadSymbol(id) { const row = table[5][id]; return import(table[3][row[0]]); }',
				].join('\n'),
			}),
			'build/interaction.js': chunk({
				fileName: 'build/interaction.js',
				code: 'export function onInteract() {}',
			}),
		},
		[],
		'/workspace/app',
		{ bundleGraphAsset: MARKLESS_BUNDLE_GRAPH, canonPath: stripBuildPrefix },
	);

	const hrefs = collectModulePreloadInjections(metadata, { wakeChunks: ['wake.js'] }).map(
		(injection) => injection.attributes?.href,
	);

	expect(hrefs).toContain('/build/wake.js');
	expect(hrefs).toContain('/build/demand-router.js');
	expect(hrefs).toContain('/build/interaction.js');
});

const stripBuildPrefix = (fileName: string) => fileName.replace(/^build\//, '');

function chunk(input: {
	readonly fileName: string;
	readonly code: string;
	readonly dynamicImports?: readonly string[];
}) {
	return {
		type: 'chunk' as const,
		fileName: input.fileName,
		name: input.fileName,
		code: input.code,
		exports: [],
		imports: [],
		dynamicImports: [...(input.dynamicImports ?? [])],
		moduleIds: [],
		facadeModuleId: null,
	};
}
