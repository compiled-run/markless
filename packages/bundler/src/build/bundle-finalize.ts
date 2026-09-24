// Post-processes the emitted bundle: chunk removal, preload wrapper stripping, symbol tables,
// facade cleanup, build metadata.
import { type MarklessBuildMetadataBundle, createBuildMetadata } from './build-metadata.ts';
import { MARKLESS_BUNDLE_GRAPH, MARKLESS_EXECUTION_DEMAND } from './chunking.ts';
import { createExecutionSizesAsset } from './execution-sizes.ts';
import { collectRenderedModules, createByteAttributionAsset } from './byte-attribution.ts';
import { clearParsedChunkCode } from './chunk-ast.ts';
import { unwrapAsyncImportWrappers } from './async-import-wrappers.ts';
import { collapseInitFacadeImports } from './init-facade-imports.ts';
import {
	type HashCharacters,
	MARKLESS_IMPORT_MAP_ASSET,
	importMapScript,
	insertImportMapScript,
	renameChunksToContentHashes,
	specifyChunkReferences,
} from './content-hash-names.ts';
import { collectModulePreloadInjections, injectHeadLinks } from './head-links.ts';
import { stripEmptyVitePreloadWrappers } from './preload-cleanup.ts';
import {
	type PreloadHelperChunk,
	stripUnusedVitePreloadHelperFromBundle,
} from './preload-helper-removal.ts';
import {
	compactGeneratedDirectSymbolLoaders,
	rewriteGeneratedSymbolFacadeImports,
	rewriteGeneratedSymbolInitExports,
} from './symbol-facade-cleanup.ts';
import { rewriteGeneratedSymbolTableUrls, verifyGeneratedSymbolTableRoutes } from './symbol-table.ts';
import {
	type ExecutionAttributionTables,
	executionLogActivationInjection,
} from '../execution-log.ts';
import type { ModuleMetadataRegistry } from '../module-metadata-registry.ts';
import { withoutFirstUse } from '../source-module.ts';
import type { MarklessRolldownOptions, MarklessTransformManifest } from '../types.ts';
import {
	emittedBundleModuleIds,
	sourceForPrerenderWakeVirtualImporter,
	sourceForResumeVirtualImporter,
	sourceForSettleVirtualImporter,
	stripBuildPrefix,
} from '../virtual-ids.ts';

export type FinalizeBundleOptions = {
	productionResumeModuleUrls?: Map<string, string>;
	productionPrerenderWakeModuleUrls?: Map<string, string>;
	productionSettleModuleUrls?: Map<string, string>;
	prerenderWakeChannel?: boolean;
	prerender?: boolean;
	publicPath?: (fileName: string) => string;
	bundleGraphAdders?: MarklessRolldownOptions['bundleGraphAdders'];
	devInjections?: MarklessRolldownOptions['devInjections'];
	executionLog?: MarklessRolldownOptions['executionLog'];
	experimentalPackPlanner?: MarklessRolldownOptions['experimentalPackPlanner'];
	experimentalNativePacking?: boolean;
};

export type FinalizeBundleContext = {
	error(message: string): never;
	emitFile(
		file:
			| { type: 'asset'; fileName: string; source: string }
			| Awaited<ReturnType<typeof createExecutionSizesAsset>>,
	): unknown;
};

export async function finalizeBundle(
	context: FinalizeBundleContext,
	bundle: MarklessBuildMetadataBundle & Record<string, unknown>,
	input: {
		readonly options: FinalizeBundleOptions;
		readonly moduleMetadata: ModuleMetadataRegistry;
		readonly root: string | undefined;
		readonly executionLogEmittedIds: ReadonlyMap<string, string>;
		readonly executionAttributionTables: (
			manifests: Iterable<MarklessTransformManifest>,
		) => ExecutionAttributionTables;
		readonly hashCharacters?: HashCharacters | undefined;
	},
): Promise<void> {
	const { options, moduleMetadata } = input;

const renderedModules = collectRenderedModules(bundle);
stripEmptyPreloadWrappersFromChunks(bundle);
const removedSymbolFacades = new Set(rewriteGeneratedSymbolFacadeImports(bundle));
for (const fileName of collapseInitFacadeImports(bundle)) removedSymbolFacades.add(fileName);
unwrapAsyncImportWrappers(bundle);
rewriteGeneratedSymbolInitExports(bundle);
compactGeneratedDirectSymbolLoaders(bundle);
const manifestBundle = bundleWithoutRemovedChunks(bundle, removedSymbolFacades);
const tableRewrite = rewriteGeneratedSymbolTableUrls(manifestBundle);
if (tableRewrite.unresolved.length > 0) {
	context.error(
		`Markless symbol resolver table contains unresolved generated symbol chunks: ${tableRewrite.unresolved.join(', ')}. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
	);
}
// The strip can erase a resolver together with every route it owned.
// Final symbol claims therefore follow exact emitted module identities.
const emittedSymbolClaims = moduleMetadata.emittedSymbolClaimMap(
	emittedBundleModuleIds(manifestBundle),
);
const attributionClaims = [...moduleMetadata.symbolClaimManifests()];
const tableIntegrity = verifyGeneratedSymbolTableRoutes(
	manifestBundle,
	emittedSymbolClaims.values(),
);
if (tableIntegrity.errors.length > 0) {
	context.error(
		`Markless symbol resolver table integrity check failed:\n${tableIntegrity.errors
			.map(
				(error) =>
					`- ${error.symbolId} -> ${error.claimedChunk}: ${error.reason}`,
			)
			.join('\n')}`,
	);
}

const specifiers =
	options.experimentalNativePacking === true
		? await specifyChunkReferences(manifestBundle, {
				publicPath: options.publicPath ?? ((fileName) => `/${fileName}`),
				root: input.root,
			})
		: undefined;
await renameChunksToContentHashes(manifestBundle, { hashCharacters: input.hashCharacters });
const importMap = specifiers?.importMap();
if (importMap && Object.keys(importMap.imports).length > 0) {
	injectImportMap(bundle, importMapScript(importMap));
	context.emitFile({
		type: 'asset',
		fileName: MARKLESS_IMPORT_MAP_ASSET,
		source: JSON.stringify(importMap),
	});
}
recordProductionResumeModuleUrls(
	bundle,
	options.productionResumeModuleUrls,
	options.publicPath,
);
if (options.prerenderWakeChannel === true) {
	recordProductionPrerenderWakeModuleUrls(
		bundle,
		options.productionPrerenderWakeModuleUrls,
		options.publicPath,
	);
	recordProductionSettleModuleUrls(
		bundle,
		(options.productionSettleModuleUrls ??= new Map()),
		options.publicPath,
	);
}

const clientManifest = createBuildMetadata(
	manifestBundle,
	emittedSymbolClaims.values(),
	input.root,
	{
		bundleGraphAsset: MARKLESS_BUNDLE_GRAPH,
		bundleGraphAdders: options.bundleGraphAdders,
		canonPath: stripBuildPrefix,
		publicPath: options.publicPath,
		injections: options.devInjections,
	},
);
clearParsedChunkCode();

const executionLogInjection = executionLogActivationInjection(
	options.executionLog,
);
if (executionLogInjection) injectHeadLinks(bundle, [executionLogInjection]);
injectHeadLinks(
	bundle,
	collectModulePreloadInjections(clientManifest, {
		publicPath: options.publicPath,
		wakeChunks:
			options.prerender ||
			options.prerenderWakeChannel === true
				? productionWakeModuleChunks(bundle)
				: undefined,
		entryChunks: Object.values(bundle)
			.filter(
				(output) =>
					!!output &&
					typeof output === 'object' &&
					(output as { type?: string }).type === 'chunk' &&
					(output as { isEntry?: boolean }).isEntry === true,
			)
			.map((chunk) =>
				stripBuildPrefix((chunk as { fileName: string }).fileName),
			),
	}),
);

context.emitFile({
	type: 'asset',
	fileName: MARKLESS_BUNDLE_GRAPH,
	source: JSON.stringify(clientManifest.bundleGraph),
});
context.emitFile(
	await createExecutionSizesAsset(
		manifestBundle,
		clientManifest,
		stripBuildPrefix,
		executionLogInjection
			? input.executionAttributionTables(attributionClaims)
			: undefined,
		{
			executionLogActive: executionLogInjection !== null,
			hookedIds: input.executionLogEmittedIds,
			root: input.root,
		},
	),
);
context.emitFile(
	createByteAttributionAsset(manifestBundle, renderedModules, input.root, stripBuildPrefix),
);
// The demand map lives in payload-module exports (tree-shaken from built
// pages by design); ship it as a build asset so witness boxes and tooling
// can derive allowed execution sets against real builds.
context.emitFile({
	type: 'asset',
	fileName: MARKLESS_EXECUTION_DEMAND,
	source: JSON.stringify(
		Object.fromEntries(
			clientManifest.modules
				.filter((module) => module.runtimeDemandMap)
				.map((module) => [
					module.source,
					options.experimentalPackPlanner
						? module.runtimeDemandMap
						: withoutFirstUse(module.runtimeDemandMap),
				]),
		),
	),
});
}

function bundleWithoutRemovedChunks(
	bundle: MarklessBuildMetadataBundle,
	removedFileNames: ReadonlySet<string>,
) {
	if (removedFileNames.size === 0) return bundle;

	const next: MarklessBuildMetadataBundle = {};
	for (const [key, output] of Object.entries(bundle)) {
		if (isChunkFile(output) && removedFileNames.has(output.fileName)) continue;
		next[key] = output;
	}
	return next;
}

function stripEmptyPreloadWrappersFromChunks(bundle: Record<string, unknown>) {
	for (const output of Object.values(bundle)) {
		if (!isChunkWithCode(output)) continue;

		const nextCode = stripEmptyVitePreloadWrappers(output.code);
		if (nextCode !== output.code) {
			output.code = nextCode;
		}
	}
	stripUnusedVitePreloadHelperFromBundle(
		Object.values(bundle).filter(
			(output): output is PreloadHelperChunk => isChunkWithCode(output) && isChunkFile(output),
		),
	);
}

function isChunkFile(output: unknown): output is {
	readonly type: 'chunk';
	readonly fileName: string;
} {
	if (!output || typeof output !== 'object') return false;
	const chunk = output as {
		readonly type?: unknown;
		readonly fileName?: unknown;
	};
	return chunk.type === 'chunk' && typeof chunk.fileName === 'string';
}

function isChunkWithCode(output: unknown): output is {
	readonly type: 'chunk';
	code: string;
} {
	if (!output || typeof output !== 'object') return false;
	const chunk = output as {
		readonly type?: unknown;
		readonly code?: unknown;
	};
	return chunk.type === 'chunk' && typeof chunk.code === 'string';
}


function recordProductionSettleModuleUrls(
	bundle: Record<string, unknown>,
	urls: Map<string, string>,
	publicPath: ((fileName: string) => string) | undefined,
): void {
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const chunk = output as {
			readonly type?: unknown;
			readonly facadeModuleId?: unknown;
			readonly fileName?: unknown;
		};
		if (
			chunk.type !== 'chunk' ||
			typeof chunk.facadeModuleId !== 'string' ||
			typeof chunk.fileName !== 'string'
		)
			continue;
		const source = sourceForSettleVirtualImporter(chunk.facadeModuleId);
		if (source) urls.set(source, publicPath?.(chunk.fileName) ?? `/${chunk.fileName}`);
	}
}

function recordProductionResumeModuleUrls(
	bundle: Record<string, unknown>,
	urls: Map<string, string> | undefined,
	publicPath: ((fileName: string) => string) | undefined,
): void {
	if (!urls) return;
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const chunk = output as {
			readonly type?: unknown;
			readonly facadeModuleId?: unknown;
			readonly fileName?: unknown;
		};
		if (
			chunk.type !== 'chunk' ||
			typeof chunk.facadeModuleId !== 'string' ||
			typeof chunk.fileName !== 'string'
		)
			continue;
		const source = sourceForResumeVirtualImporter(chunk.facadeModuleId);
		if (source) urls.set(source, publicPath?.(chunk.fileName) ?? `/${chunk.fileName}`);
	}
}

function recordProductionPrerenderWakeModuleUrls(
	bundle: Record<string, unknown>,
	urls: Map<string, string> | undefined,
	publicPath: ((fileName: string) => string) | undefined,
): void {
	if (!urls) return;
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const chunk = output as {
			readonly type?: unknown;
			readonly facadeModuleId?: unknown;
			readonly fileName?: unknown;
		};
		if (
			chunk.type !== 'chunk' ||
			typeof chunk.facadeModuleId !== 'string' ||
			typeof chunk.fileName !== 'string'
		)
			continue;
		const source = sourceForPrerenderWakeVirtualImporter(chunk.facadeModuleId);
		if (source) urls.set(source, publicPath?.(chunk.fileName) ?? `/${chunk.fileName}`);
	}
}

function productionWakeModuleChunks(bundle: Record<string, unknown>): string[] {
	const chunks: string[] = [];
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const chunk = output as {
			readonly type?: unknown;
			readonly facadeModuleId?: unknown;
			readonly fileName?: unknown;
		};
		if (
			chunk.type === 'chunk' &&
			typeof chunk.facadeModuleId === 'string' &&
			typeof chunk.fileName === 'string' &&
			(sourceForResumeVirtualImporter(chunk.facadeModuleId) ||
				sourceForPrerenderWakeVirtualImporter(chunk.facadeModuleId))
		) {
			chunks.push(stripBuildPrefix(chunk.fileName));
		}
	}
	return chunks;
}

function injectImportMap(bundle: Record<string, unknown>, script: string): void {
	for (const output of Object.values(bundle)) {
		if (!output || typeof output !== 'object') continue;
		const asset = output as { type?: unknown; fileName?: unknown; source?: unknown };
		if (
			asset.type !== 'asset' ||
			typeof asset.fileName !== 'string' ||
			!asset.fileName.endsWith('.html') ||
			typeof asset.source !== 'string'
		)
			continue;
		asset.source = insertImportMapScript(asset.source, script);
	}
}
