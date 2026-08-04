import { describe, expect, test } from 'vitest';
import { verifyGeneratedSymbolTableRoutes } from '../src/build/symbol-table.ts';
import type { MarklessTransformManifest } from '../src/types.ts';

describe('generated symbol-table identity integrity', () => {
	test('rejects unemitted and queried-id-only symbol chunks', () => {
		const source = '/workspace/app/pages/index.tsrx';
		const missingId = 'virtual:markless:symbol:missing';
		const queriedOnlyId = 'virtual:markless:symbol:queried-only';
		const manifest: MarklessTransformManifest = {
			source,
			payload: { virtualModuleId: 'virtual:markless:payload:index' },
			resolver: { virtualModuleId: 'virtual:markless:resolver:index' },
			symbols: [
				{
					symbolId: 'symbol:missing',
					virtualModuleId: missingId,
					exportName: 'missingSymbol',
					kind: 'event',
				},
				{
					symbolId: 'symbol:queried-only',
					virtualModuleId: queriedOnlyId,
					exportName: 'queriedOnlySymbol',
					kind: 'event',
				},
			],
		};
		const bundle = {
			'index.js': chunk({
				fileName: 'index.js',
				moduleIds: [source],
				dynamicImports: ['queried-only.js'],
			}),
			'queried-only.js': chunk({
				fileName: 'queried-only.js',
				moduleIds: [`${queriedOnlyId}?markless-route`],
				exports: ['queriedOnlySymbol'],
			}),
		};

		expect(verifyGeneratedSymbolTableRoutes(bundle, [manifest])).toEqual({
			verified: 0,
			errors: [
				{
					symbolId: 'symbol:missing',
					claimedChunk: '<missing symbol chunk>',
					reason: `generated symbol module ${missingId} was not emitted`,
				},
				{
					symbolId: 'symbol:queried-only',
					claimedChunk: '<missing symbol chunk>',
					reason: `generated symbol module ${queriedOnlyId} was not emitted`,
				},
			],
		});
	});
});

function chunk(input: {
	readonly fileName: string;
	readonly moduleIds: readonly string[];
	readonly exports?: readonly string[];
	readonly dynamicImports?: readonly string[];
}) {
	return {
		type: 'chunk' as const,
		fileName: input.fileName,
		code: 'export {};',
		moduleIds: input.moduleIds,
		exports: input.exports ?? [],
		imports: [],
		dynamicImports: input.dynamicImports ?? [],
	};
}
