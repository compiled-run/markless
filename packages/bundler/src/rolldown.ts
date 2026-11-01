import type { InputOptions, Plugin } from 'rolldown';
import {
	DEBUGGING_PLAYBOOK_HINT,
	clearCompileCache,
	computeExecutionAttribution,
	resetParseCache,
	type LinkedModuleChildResolution,
} from '@markless/compiler';
import { clearParsedChunkCode } from './build/chunk-ast.ts';
import { retireCompileWorkers } from './build-workers.ts';
import { clearModuleSpecifiers } from './hooks/transform-emit.ts';
import { clearFactoredRenderDataLiterals } from './render-data-literals.ts';
import { clearStrippedCode } from './transform.ts';
import {
	moveBuildMetadataOutOfClientOutput,
	moveImportMapOutOfClientOutput,
} from './build/build-manifests.ts';
import { executionLogActivationInjection } from './execution-log.ts';
import { outputDefaults } from './build/chunking.ts';
import { nativePackingPlugins, type PackOwnership } from './build/native-packing.ts';
import {
	chunkImportMapEnabled,
	DEPRECATED_NATIVE_PACKING_WARNING,
	nativePackingEnabled,
} from './packing-option.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	invalidateAllGeneratedModules,
	invalidateEditedGeneratedModules,
} from './dev-invalidation.ts';
import { generateBundleHook } from './hooks/generate-bundle.ts';
import { machinePathLeaks, machinePathRoots } from './build/machine-paths.ts';
import {
	MARKLESS_IMPORT_MAP_ASSET,
	staleChunkNamesMessage,
	staleContentHashNames,
	unmappedChunkSpecifiers,
} from './build/content-hash-names.ts';
import type {
	Environment,
	InternalMarklessRolldownOptions,
	MarklessHookContext,
} from './hooks/hook-context.ts';
import { loadHook, resolveIdHook } from './hooks/resolve-load.ts';
import { transformHook } from './hooks/transform-hook.ts';
import { fallbackImportedSource } from './link-driver.ts';
import { createPluginState } from './plugin-state.ts';
import { encodedSymbolSource } from './source-module.ts';
import { moduleIdFor } from './module-id.ts';
import { importedRouteModules } from './composed-route-modules.ts';
import type {
	ClientBuildHandoff,
	MarklessEnvironment,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
} from './types.ts';
import { clientSymbolEntries } from './virtual-ids.ts';
import type { BuiltPrerenderRecords } from './build/prerender.ts';

export type {
	BundleGraphAdder,
	ClientBuildHandoff,
	GlobalInjections,
	PreloadGraphContext,
	PreloadGraphEntries,
	PreloadGraphEntriesAdder,
	MarklessAsset,
	MarklessBuildMetadata,
	MarklessBundle,
	MarklessBundleGraph,
	MarklessDevServer,
	MarklessEnvironment,
	MarklessManifest,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

export type MarklessRolldownPlugin = Plugin & { api: MarklessRolldownPluginApi };

export const marklessClient = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'client', options });
export const marklessServer = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'server', options });
export const marklessLib = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'lib', options });

export function createMarklessRolldownPlugin(input: {
	environment: Environment;
	options?: MarklessRolldownOptions;
	prerenderRecordsBySource?: ReadonlyMap<string, BuiltPrerenderRecords>;
}): MarklessRolldownPlugin {
	const environment = input.environment;
	const internalOptions = (input.options ?? {}) as InternalMarklessRolldownOptions;
	const state = createPluginState();
	const { importedChildren, clientSymbolEntrySources } = state;
	const dev = createMarklessDevGraph();
	// Every entry is written by the link driver, so the linked-child fields are
	// present even though the shared state map is typed by its narrower shape.
	const linkedChildren = importedChildren as Map<string, LinkedModuleChildResolution>;
	let root = internalOptions.rootDir;
	const name = pluginName(environment);

	function getEnvironment(context: unknown) {
		if (typeof environment === 'function') {
			return environment(context);
		}

		return environment;
	}

	function getRoot() {
		return root ?? internalOptions.rootDir;
	}
	let declaredPacks: PackOwnership | undefined;
	const [packing, facades] =
		environment === 'client' &&
		nativePackingEnabled(internalOptions) &&
		!internalOptions.dev
			? nativePackingPlugins(
					() => getRoot() ?? '',
					runtimeDemandMaps,
					runtimeDemandSources,
					directCsrOnly,
				)
			: [];

	function* runtimeDemandMaps() {
		for (const manifest of state.moduleMetadata.symbolClaimManifests())
			yield manifest.runtimeDemandMap;
	}

	// Every compiled module of this build mounts through the direct-DOM renderer.
	function directCsrOnly() {
		let compiled = false;
		for (const manifest of state.moduleMetadata.symbolClaimManifests()) {
			if (manifest.directCsr !== true) return false;
			compiled = true;
		}
		return compiled;
	}

	function* runtimeDemandSources() {
		for (const manifest of state.moduleMetadata.symbolClaimManifests())
			yield {
				source: manifest.source,
				map: manifest.runtimeDemandMap,
				...(manifest.symbolGroups
					? { symbolGroups: new Map(Object.entries(manifest.symbolGroups)) }
					: {}),
			};
	}

	// `resolveSpecifier`/`encodeSource` are the bundler's; the compiler pass owns
	// only the graph flattening.
	function attributionTables(manifests: Iterable<MarklessTransformManifest>) {
		return computeExecutionAttribution({
			moduleManifests: manifests,
			childTable: importedChildren.values(),
			root: getRoot(),
			resolveSpecifier: fallbackImportedSource,
			encodeSource: (source) => encodedSymbolSource(moduleIdFor(source, getRoot())),
		}).tables;
	}

	const context: MarklessHookContext = {
		state,
		internalOptions,
		dev,
		environment,
		linkedChildren,
		prerenderRecordsBySource: input.prerenderRecordsBySource,
		getEnvironment,
		getRoot,
		attributionTables,
	};

	const plugin = {
		api: {
			invalidateGeneratedModules(
				parent: string,
				currentEnvironment?: MarklessEnvironment,
				nextSource?: string,
			) {
				if (nextSource !== undefined) {
					return invalidateEditedGeneratedModules(
						context,
						parent,
						currentEnvironment,
						nextSource,
					);
				}
				return invalidateAllGeneratedModules(context, parent, currentEnvironment);
			},
			runtimeDemandMaps,
			runtimeDemandSources,
			directCsrOnly,
			chunkImportMap: () => chunkImportMapEnabled(internalOptions),
			enableChunkImportMap: () => {
				internalOptions.chunkImportMap = true;
			},
			declareServerOnlyProps: (
				resolve: InternalMarklessRolldownOptions['serverOnlyProps'],
			) => {
				internalOptions.serverOnlyProps = resolve;
			},
			declareRouteModules: (isRoute: (moduleId: string) => boolean) => {
				internalOptions.routeModules = isRoute;
			},
			declarePackOwnership: (packs: PackOwnership) => {
				declaredPacks = packs;
			},
			clientBuildHandoff: () => ({
				resumeModuleUrls: [...(internalOptions.productionResumeModuleUrls ?? [])],
				prerenderWakeModuleUrls: [
					...(internalOptions.productionPrerenderWakeModuleUrls ?? []),
				],
				settleModuleUrls: [...(internalOptions.productionSettleModuleUrls ?? [])],
				prerenderWakeCapabilities: [...state.prerenderWakeCapabilities],
				styleClosures: [...state.styleClosures].map(([source, ids]) => [source, [...ids]]),
			}),
			adoptClientBuildHandoff: (handoff: ClientBuildHandoff) => {
				const fill = (
					target: Map<string, string> | undefined,
					rows: ClientBuildHandoff['resumeModuleUrls'],
				) => {
					const map = target ?? new Map<string, string>();
					for (const [source, url] of rows) map.set(source, url);
					return map;
				};
				internalOptions.productionResumeModuleUrls = fill(
					internalOptions.productionResumeModuleUrls,
					handoff.resumeModuleUrls,
				);
				internalOptions.productionPrerenderWakeModuleUrls = fill(
					internalOptions.productionPrerenderWakeModuleUrls,
					handoff.prerenderWakeModuleUrls,
				);
				internalOptions.productionSettleModuleUrls = fill(
					internalOptions.productionSettleModuleUrls,
					handoff.settleModuleUrls,
				);
				for (const [source, capable] of handoff.prerenderWakeCapabilities)
					state.prerenderWakeCapabilities.set(source, capable);
				for (const [source, ids] of handoff.styleClosures)
					state.styleClosures.set(source, new Set(ids));
			},
		},
		name,
		options(input: InputOptions) {
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment === 'lib') return input;
			// Debug region comments name each module by its id, and Markless's virtual ids carry source paths.
			const withoutRegions: InputOptions =
				internalOptions.dev === true
					? input
					: {
							...input,
							experimental: {
								...input.experimental,
								attachDebugInfo: input.experimental?.attachDebugInfo ?? 'none',
							},
						};
			if (currentEnvironment !== 'client') {
				return withoutRegions;
			}

			return {
				...withoutRegions,
				preserveEntrySignatures: packing
					? 'allow-extension'
					: (input.preserveEntrySignatures ?? 'allow-extension'),
				// Leaves off the pass a route build never ran while its page modules awaited; facade merging stays on.
				...(packing && internalOptions.routeModules
					? {
							experimental: {
								...withoutRegions.experimental,
								chunkOptimization: {
									mergeCommonChunks: true,
									avoidRedundantChunkLoads: false,
								},
							},
						}
					: {}),
			};
		},
		async buildStart(input) {
			if (internalOptions.experimentalNativePacking !== undefined)
				this.warn(DEPRECATED_NATIVE_PACKING_WARNING);
			if (!root) {
				root = internalOptions.rootDir ?? input.cwd;
			}
			state.reset();
			dev.reset();
			clearParsedChunkCode();

			const currentRoot = getRoot();
			const isRoute = internalOptions.routeModules;
			// A dev server compiles modules one request at a time and never learns every importer first.
			if (isRoute && internalOptions.dev !== true && currentRoot) {
				const imported = await importedRouteModules({
					root: currentRoot,
					isRoute: (file) => isRoute(moduleIdFor(file, currentRoot)),
					resolve: async (specifier, importer) =>
						(
							await this.resolve(specifier, importer, { skipSelf: true }).catch(
								() => null,
							)
						)?.id,
				});
				const importedIds = new Set(
					[...imported].map((file) => moduleIdFor(file, currentRoot)),
				);
				internalOptions.unimportedRouteModule = (moduleId) =>
					isRoute(moduleId) && !importedIds.has(moduleId);
			} else internalOptions.unimportedRouteModule = undefined;
			if (getEnvironment(this) === 'client') {
				for (const source of clientSymbolEntries(input.input, currentRoot)) {
					clientSymbolEntrySources.add(source);
				}
			}
		},
		async buildEnd(error) {
			const hook = packing?.buildEnd;
			await (typeof hook === 'function' ? hook : hook?.handler)?.call(this, error);
			// Kept only to reuse a compile within the module graph; render and later environments never read it.
			if (internalOptions.dev !== true) {
				state.linkedTransformCache.clear();
				releaseTransformMemos();
				await retireCompileWorkers();
			}
		},
		renderStart: facades?.renderStart,
		renderChunk: facades?.renderChunk,
		renderError: facades?.renderError,
		outputOptions(output) {
			const defaults = outputDefaults(output, getEnvironment(this));
			const hook = packing?.outputOptions;
			const handler = typeof hook === 'function' ? hook : hook?.handler;
			return handler?.call(this, defaults) ?? defaults;
		},
		async resolveId(source, importer) {
			return await resolveIdHook(context, this, source, importer);
		},
		async load(id) {
			return await loadHook(context, this, id);
		},
		async transform(code, id) {
			return await transformHook(context, this, code, id);
		},
		generateBundle: {
			order: 'post',
			async handler(output, bundle, isWrite) {
				const hook = facades?.generateBundle;
				const handler = typeof hook === 'function' ? hook : hook?.handler;
				await handler?.call(this, output, bundle, isWrite);
				await generateBundleHook(
					context,
					this,
					bundle,
					output.hashCharacters,
					packing?.api ?? declaredPacks,
				);
				// Each cached tree holds its parser's native buffer; a large site's chunks outgrew the heap held together.
				clearParsedChunkCode();
			},
		},
		async writeBundle(output, bundle) {
			if (getEnvironment(this) !== 'client') return;
			const root = getRoot();
			const leaks = root ? machinePathLeaks(bundle, machinePathRoots(root)) : [];
			if (leaks.length > 0)
				this.error(
					`Markless client output spells this machine's checkout path, so it would differ between machines: ${leaks.join(', ')}. Every id written into client output must be root-relative (moduleIdFor / rootRelativeId).`,
				);
			const stale = await staleContentHashNames(bundle, {
				hashCharacters: output.hashCharacters,
			});
			if (stale.length > 0) this.error(staleChunkNamesMessage(stale));
			const unmapped = unmappedChunkSpecifiers(bundle);
			if (unmapped.length > 0)
				this.error(
					`Markless emitted chunks that import specifiers its import map does not resolve to an emitted chunk: ${unmapped.join(', ')}. A plugin changed chunk code or file names after the Markless finalize pass. ${DEBUGGING_PLAYBOOK_HINT}`,
				);
			if (output.dir) {
				await moveImportMapOutOfClientOutput(
					output.dir,
					MARKLESS_IMPORT_MAP_ASSET in bundle,
				);
				await moveBuildMetadataOutOfClientOutput(output.dir, new Set(Object.keys(bundle)), {
					executionLogActive:
						executionLogActivationInjection(internalOptions.executionLog) !== null,
				});
			}
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	return plugin;
}

// Memos that spare repeat work while a module graph is built; rendering chunks reads none of them, and a later
// environment's compiles come back from the persistent compile store.
function releaseTransformMemos(): void {
	clearCompileCache();
	resetParseCache();
	clearStrippedCode();
	clearModuleSpecifiers();
	clearFactoredRenderDataLiterals();
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'markless:rolldown';
	}

	return `markless:rolldown:${environment}`;
}

export {
	MARKLESS_BUILD_METADATA_FILES,
	MARKLESS_BUNDLE_GRAPH,
	MARKLESS_BUILD_PREFIX,
	MARKLESS_PUBLIC_BUILD_METADATA_FILES,
	outputDefaults,
} from './build/chunking.ts';
export { createBuildMetadata } from './build/build-metadata.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { collectHeadLinkInjections } from './build/head-links.ts';
export {
	marklessBuildManifestDir,
	marklessBuildManifestPath,
	marklessImportMapPath,
} from './build/build-manifests.ts';
export {
	MARKLESS_CHUNK_SPECIFIER_PREFIX,
	MARKLESS_IMPORT_MAP_ASSET,
	importMapScript,
	insertImportMapScript,
} from './build/content-hash-names.ts';
export {
	MARKLESS_VIRTUAL_PREFIX,
	prerenderWakeVirtualModuleId,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
