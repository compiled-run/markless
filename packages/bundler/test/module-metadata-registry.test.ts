import { describe, expect, test } from 'vitest';
import { sourceSymbolManifest } from '../src/link-driver.ts';
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

		expect(sourceSymbolManifest(registry, source, 'client')?.symbols).toEqual([
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
			registry.beginSourceSymbolClaims('client', source, emitted);
		}
		registry.expectSourceSymbolClaims('client', source, [source, wake, resume, symbols]);
		registry.recordSymbolClaims(wake, manifest(wake, resolver, []));
		registry.finishSourceSymbolClaims('client', source, wake);
		const sealing = registry.sealSourceSymbolClaims('client', source);
		let sealed = false;
		void sealing.then(() => {
			sealed = true;
		});
		await Promise.resolve();
		expect(sealed).toBe(false);

		registry.recordSymbolClaims(resume, manifest(resume, resolver, [imported]));
		registry.finishSourceSymbolClaims('client', source, resume);
		registry.recordSymbolClaims(symbols, manifest(symbols, resolver, [imported]));
		registry.finishSourceSymbolClaims('client', source, symbols);
		registry.beginSourceSymbolClaims('client', source, source);
		await Promise.resolve();
		expect(sealed).toBe(false);
		registry.recordSymbolClaims(source, manifest(source, resolver, [imported]));
		registry.finishSourceSymbolClaims('client', source, source);
		await sealing;

		expect(sourceSymbolManifest(registry, source, 'client')?.symbols).toContainEqual(imported);
	});

	test('a reader waits for the variant in flight in its own environment', async () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		const imported = symbol(source, 'symbol:1', 'event-handler');

		// The client publishes the plain module, then starts the symbols sibling.
		registry.beginSourceSymbolClaims('client', source, source);
		registry.recordSymbolClaims(source, manifest(source, resolver, []));
		registry.finishSourceSymbolClaims('client', source, source);
		registry.expectSourceSymbolClaims('client', source, [symbols]);
		registry.beginSourceSymbolClaims('client', source, symbols);

		const waiting = registry.awaitSourceClaimsPublished('client', source);
		let resolved = false;
		void waiting.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);

		registry.recordSymbolClaims(symbols, manifest(symbols, resolver, [imported]));
		registry.finishSourceSymbolClaims('client', source, symbols);
		await waiting;

		expect(sourceSymbolManifest(registry, source, 'client')?.symbols).toContainEqual(imported);
	});

	test('the publication ledger is per environment', async () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const registry = new ModuleMetadataRegistry();
		registry.beginSourceSymbolClaims('client', source, source);
		registry.finishSourceSymbolClaims('client', source, source);

		// A client publication says nothing about the server compile of the same source.
		expect(registry.sourceClaimsPublished('client', source)).toBe(true);
		expect(registry.sourceClaimsPublished('server', source)).toBe(false);

		registry.beginSourceSymbolClaims('server', source, source);
		let resolved = false;
		const waiting = registry.awaitSourceClaimsPublished('server', source).then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);
		expect(() => sourceSymbolManifest(registry, source, 'server')).toThrow(
			'MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED',
		);
		expect(() => sourceSymbolManifest(registry, source, 'client')).not.toThrow();

		registry.finishSourceSymbolClaims('server', source, source);
		await waiting;
		expect(resolved).toBe(true);

		registry.invalidateSourceSymbolClaims(source, source);
		expect(registry.sourceClaimsPublished('client', source)).toBe(false);
		expect(registry.sourceClaimsPublished('server', source)).toBe(false);
	});

	test('a source blocked on its reader is reported instead of deadlocking', async () => {
		const parent = '/workspace/app/components/Tree.tsrx';
		const child = '/workspace/app/components/Branch.tsrx';
		const registry = new ModuleMetadataRegistry();
		registry.beginSourceSymbolClaims('server', parent, parent);
		registry.beginSourceSymbolClaims('server', child, child);

		// The parent is loading the child; the child then reads the parent back.
		let release!: () => void;
		const loading = registry.whileWaiting(
			'server',
			parent,
			child,
			() => new Promise<void>((resolve) => (release = resolve)),
		);
		await expect(registry.awaitSourceClaimsPublished('server', parent, child)).resolves.toBe(
			false,
		);
		await expect(registry.awaitSourceClaimsPublished('server', parent, parent)).resolves.toBe(
			false,
		);
		release();
		await loading;

		// Once the load edge is gone, the same read waits for the parent like any other.
		let resolved = false;
		const waiting = registry.awaitSourceClaimsPublished('server', parent, child).then((awaited) => {
			resolved = awaited;
		});
		await Promise.resolve();
		expect(resolved).toBe(false);
		registry.finishSourceSymbolClaims('server', parent, parent);
		await waiting;
		expect(resolved).toBe(true);
	});

	test('a republication of an already published variant does not fail a concurrent read', () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		const imported = symbol(source, 'symbol:1', 'event-handler');

		for (const emitted of [source, symbols]) {
			registry.beginSourceSymbolClaims('client', source, emitted);
			registry.recordSymbolClaims(
				emitted,
				manifest(emitted, resolver, emitted === symbols ? [imported] : []),
			);
			registry.finishSourceSymbolClaims('client', source, emitted);
		}
		// A second importer forces the symbols sibling again while this read runs.
		registry.expectSourceSymbolClaims('client', source, [symbols]);
		registry.beginSourceSymbolClaims('client', source, symbols);

		expect(sourceSymbolManifest(registry, source, 'client')?.symbols).toContainEqual(imported);
	});

	test('a variant compiling for the first time still fails closed', () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();

		registry.beginSourceSymbolClaims('client', source, source);
		registry.recordSymbolClaims(source, manifest(source, resolver, []));
		registry.finishSourceSymbolClaims('client', source, source);
		registry.beginSourceSymbolClaims('client', source, symbols);

		expect(() => sourceSymbolManifest(registry, source, 'client')).toThrow(
			'MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED',
		);
	});

	test('one importer expectation list does not gate another reader', () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();
		const imported = symbol(source, 'symbol:1', 'event-handler');

		registry.beginSourceSymbolClaims('client', source, source);
		registry.recordSymbolClaims(source, manifest(source, resolver, [imported]));
		registry.finishSourceSymbolClaims('client', source, source);
		// A client importer names the routes it is about to force; that is its own
		// seal's wait list, and a reader in another environment must not inherit it.
		registry.expectSourceSymbolClaims('client', source, [symbols]);

		expect(sourceSymbolManifest(registry, source, 'client')?.symbols).toContainEqual(imported);
	});

	test('an invalidated variant recompiling is a first publication again', () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();

		registry.beginSourceSymbolClaims('client', source, source);
		registry.recordSymbolClaims(source, manifest(source, resolver, []));
		registry.finishSourceSymbolClaims('client', source, source);
		// The edit drops the claims, so remembering the publication would wave a
		// reader past a variant whose claims are no longer in the registry.
		registry.invalidateSourceSymbolClaims(source, source);
		expect(() => sourceSymbolManifest(registry, source, 'client')).not.toThrow();

		registry.beginSourceSymbolClaims('client', source, source);
		expect(() => sourceSymbolManifest(registry, source, 'client')).toThrow(
			'MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED',
		);
	});

	test('a transform that fails releases its publication and the read stays fail-closed', async () => {
		const source = '/workspace/app/components/Checkbox.tsrx';
		const symbols = `${source}?markless-symbols`;
		const registry = new ModuleMetadataRegistry();

		registry.expectSourceSymbolClaims('client', source, [symbols]);
		registry.beginSourceSymbolClaims('client', source, symbols);
		const waiting = registry.awaitSourceClaimsPublished('client', source);
		registry.releaseSourceSymbolClaims('client', source, symbols);
		await waiting;

		expect(() => sourceSymbolManifest(registry, source, 'client')).toThrow(
			'MARKLESS_SOURCE_SYMBOL_CLAIMS_UNSEALED',
		);
	});

	test('a failed variant an importer still expects rejects its seal with the compile error', async () => {
		const source = '/workspace/app/components/Shell.tsrx';
		const symbols = `${source}?markless-symbols`;
		const registry = new ModuleMetadataRegistry();
		const failure = new Error('MARKLESS_CAPTURE_OPAQUE_PROP: child failed');

		registry.beginSourceSymbolClaims('client', source, symbols);
		registry.releaseSourceSymbolClaims('client', source, symbols, failure);
		// The loader serves the cached failure without re-running the transform,
		// so nothing will ever begin or finish this variant again.
		registry.expectSourceSymbolClaims('client', source, [symbols]);

		await expect(registry.sealSourceSymbolClaims('client', source)).rejects.toBe(failure);
		await expect(registry.awaitSourceClaimsPublished('client', source)).resolves.toBe(true);
	});

	test('a seal already waiting on a variant rejects when that variant fails', async () => {
		const source = '/workspace/app/components/Shell.tsrx';
		const symbols = `${source}?markless-symbols`;
		const registry = new ModuleMetadataRegistry();
		const failure = new Error('child failed');

		registry.expectSourceSymbolClaims('client', source, [symbols]);
		registry.beginSourceSymbolClaims('client', source, symbols);
		const sealing = registry.sealSourceSymbolClaims('client', source);
		const awaiting = registry.awaitSourceClaimsPublished('client', source);
		registry.releaseSourceSymbolClaims('client', source, symbols, failure);

		await expect(sealing).rejects.toBe(failure);
		// The shared barrier only stops waiting; the claim read stays the fail-closed judge.
		await expect(awaiting).resolves.toBe(true);
	});

	test('a variant that recompiles and publishes after a failure clears it', async () => {
		const source = '/workspace/app/components/Shell.tsrx';
		const symbols = `${source}?markless-symbols`;
		const resolver = `virtual:markless:resolver:${encodeURIComponent(source)}`;
		const registry = new ModuleMetadataRegistry();

		registry.expectSourceSymbolClaims('client', source, [symbols]);
		registry.beginSourceSymbolClaims('client', source, symbols);
		registry.releaseSourceSymbolClaims('client', source, symbols, new Error('child failed'));
		registry.beginSourceSymbolClaims('client', source, symbols);
		registry.recordSymbolClaims(symbols, manifest(source, resolver, []));
		registry.finishSourceSymbolClaims('client', source, symbols);

		await expect(registry.sealSourceSymbolClaims('client', source)).resolves.toBeUndefined();
		await expect(registry.awaitSourceClaimsPublished('client', source)).resolves.toBe(true);
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

		expect(() => sourceSymbolManifest(registry, source, 'client')).toThrow(
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
