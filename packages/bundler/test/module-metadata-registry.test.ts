import { describe, expect, test } from 'vitest';
import { ModuleMetadataRegistry } from '../src/module-metadata-registry.ts';
import type { MarklessTransformManifest } from '../src/types.ts';

describe('module metadata identity registry', () => {
	test('shares source capture metadata across route, resume, and render-data claims', () => {
		const source = '/workspace/app/components/UpdateSummary.tsrx';
		const registry = new ModuleMetadataRegistry();
		const captureMetadata = {
			passId: 'capture-analysis',
			extractedSymbols: [],
			boundResolverRows: [],
			diagnostics: [],
		} as NonNullable<MarklessTransformManifest['captureMetadata']>;
		const emittedModules = [
			`${source}?markless-route`,
			`${source}?markless-resume`,
			`${source}?markless-render-data`,
		];

		registry.recordCaptureMetadata(source, { captureMetadata });
		for (const emittedModule of emittedModules) {
			registry.recordSymbolClaims(emittedModule, manifest(emittedModule));
		}

		expect(
			new Set(emittedModules.map(() => registry.captureMetadataForSource(source))),
		).toEqual(new Set([captureMetadata]));
		expect(
			emittedModules.map((emittedModule) => registry.symbolClaimMap().get(emittedModule)?.source),
		).toEqual(emittedModules);
		expect([...registry.symbolClaimManifests()].map((item) => item.source)).toEqual(
			emittedModules,
		);
	});

	test('retains symbol claims only for exact emitted module owners', () => {
		const registry = new ModuleMetadataRegistry();
		const emitted = '/workspace/app/pages/index.tsrx?markless-prerender-wake';
		const strippedResolver = 'virtual:markless:resolver:%2Fworkspace%2Fapp%2Fpages%2Findex.tsrx';
		registry.recordSymbolClaims(emitted, manifest(emitted));
		registry.recordSymbolClaims(strippedResolver, manifest(strippedResolver));

		expect([...registry.emittedSymbolClaimMap([emitted]).keys()]).toEqual([emitted]);
	});
});

function manifest(source: string): MarklessTransformManifest {
	return {
		source,
		payload: { virtualModuleId: `virtual:markless:payload:${encodeURIComponent(source)}` },
		resolver: { virtualModuleId: `virtual:markless:resolver:${encodeURIComponent(source)}` },
		symbols: [
			{
				symbolId: 'symbol:weighted-count',
				virtualModuleId: `virtual:markless:symbol:${encodeURIComponent(source)}`,
				exportName: 'weightedCount',
				kind: 'computed-derive',
			},
		],
	};
}
