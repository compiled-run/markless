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
			emittedModules.map(
				(emittedModule) => registry.symbolClaimMap().get(emittedModule)?.source,
			),
		).toEqual(emittedModules);
		expect([...registry.symbolClaimManifests()].map((item) => item.source)).toEqual(
			emittedModules,
		);
	});

	test('retains symbol claims only for exact emitted module owners', () => {
		const registry = new ModuleMetadataRegistry();
		const emitted = '/workspace/app/pages/index.tsrx?markless-prerender-wake';
		const strippedResolver =
			'virtual:markless:resolver:%2Fworkspace%2Fapp%2Fpages%2Findex.tsrx';
		registry.recordSymbolClaims(emitted, manifest(emitted));
		registry.recordSymbolClaims(strippedResolver, manifest(strippedResolver));

		expect([...registry.emittedSymbolClaimMap([emitted]).keys()]).toEqual([emitted]);
	});

	test('combines compatible source claims from emitted siblings without losing a linked boundary symbol', () => {
		const source = '/workspace/app/components/WeatherPanel.tsrx';
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		const event = symbol(source, 'symbol:event', 'event-handler');
		const boundaryUpdate = symbol(source, 'symbol:settle', 'async-boundary-update');

		registry.recordSymbolClaims(source, manifest(source, resolver, [event]));
		registry.recordSymbolClaims(
			`${source}?markless-symbols`,
			manifest(`${source}?markless-symbols`, resolver, [event, boundaryUpdate]),
		);

		expect(registry.sourceSymbolClaims(source, resolver)?.symbols).toEqual([
			event,
			boundaryUpdate,
		]);
	});

	test('client claim sealing waits for every emitted sibling final publication', async () => {
		const source = '/workspace/app/components/UpdateSummary.tsrx';
		const resume = `${source}?markless-resume`;
		const wake = `${source}?markless-prerender-wake`;
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		const imported = symbol(source, 'symbol:1', 'async-boundary-update');

		for (const emitted of [wake, resume, symbols]) {
			registry.beginSourceSymbolClaims(source, emitted);
		}
		registry.expectSourceSymbolClaims(source, [source, wake, resume, symbols]);
		registry.recordSymbolClaims(wake, manifest(wake, resolver, []));
		registry.finishSourceSymbolClaims(source, wake);
		const sealing = registry.sealSourceSymbolClaims(source);
		let sealed = false;
		void sealing.then(() => {
			sealed = true;
		});
		await Promise.resolve();
		expect(sealed).toBe(false);

		registry.recordSymbolClaims(resume, manifest(resume, resolver, [imported]));
		registry.finishSourceSymbolClaims(source, resume);
		registry.recordSymbolClaims(symbols, manifest(symbols, resolver, [imported]));
		registry.finishSourceSymbolClaims(source, symbols);
		registry.beginSourceSymbolClaims(source, source);
		await Promise.resolve();
		expect(sealed).toBe(false);
		registry.recordSymbolClaims(source, manifest(source, resolver, [imported]));
		registry.finishSourceSymbolClaims(source, source);
		await sealing;

		expect(registry.sourceSymbolClaims(source, resolver)?.symbols).toContainEqual(imported);
	});

	test('refuses incompatible claims for the same source symbol', () => {
		const source = '/workspace/app/components/WeatherPanel.tsrx';
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		registry.recordSymbolClaims(
			source,
			manifest(source, resolver, [symbol(source, 'symbol:event', 'event-handler')]),
		);
		registry.recordSymbolClaims(
			`${source}?markless-symbols`,
			manifest(`${source}?markless-symbols`, resolver, [
				{ ...symbol(source, 'symbol:event', 'event-handler'), exportName: 'conflict' },
			]),
		);

		expect(() => registry.sourceSymbolClaims(source, resolver)).toThrow(
			'MARKLESS_SOURCE_SYMBOL_CLAIMS_DIVERGED',
		);
	});
});

function manifest(
	source: string,
	resolverId = `virtual:markless:resolver:${encodeURIComponent(source)}`,
	symbols = [symbol(source, 'symbol:weighted-count', 'computed-derive')],
): MarklessTransformManifest {
	return {
		source,
		payload: { virtualModuleId: `virtual:markless:payload:${encodeURIComponent(source)}` },
		resolver: { virtualModuleId: resolverId },
		symbols,
	};
}

function symbol(
	source: string,
	symbolId: string,
	kind: MarklessTransformManifest['symbols'][number]['kind'],
): MarklessTransformManifest['symbols'][number] {
	return {
		symbolId,
		virtualModuleId: `virtual:markless:symbol:${encodeURIComponent(source)}:${encodeURIComponent(symbolId)}`,
		exportName: symbolId.replace(':', '_'),
		kind,
	};
}
