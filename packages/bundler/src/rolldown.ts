import type { InputOptions, Plugin } from 'rolldown';
import { computeExecutionAttribution, type LinkedModuleChildResolution } from '@markless/compiler';
import { clearParsedChunkCode } from './build/chunk-ast.ts';
import { outputDefaults } from './build/chunking.ts';
import { nativePackingPlugins } from './build/native-packing.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	invalidateAllGeneratedModules,
	invalidateEditedGeneratedModules,
} from './dev-invalidation.ts';
import { generateBundleHook } from './hooks/generate-bundle.ts';
import {
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
import type {
	MarklessEnvironment,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
} from './types.ts';
import { clientSymbolEntries } from './virtual-ids.ts';
import type { BuiltPrerenderRecords } from './build/prerender.ts';

export type {
	BundleGraphAdder,
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
	const [packing, facades] =
		environment === 'client' &&
		internalOptions.experimentalNativePacking &&
		!internalOptions.dev
			? nativePackingPlugins(
					() => getRoot() ?? '',
					runtimeDemandMaps,
					internalOptions.experimentalPackPlanner
						? {
								mode: internalOptions.experimentalPackPlanner,
								demandSources: runtimeDemandSources,
							}
						: undefined,
				)
			: [];

	function* runtimeDemandMaps() {
		for (const manifest of state.moduleMetadata.symbolClaimManifests())
			yield manifest.runtimeDemandMap;
	}

	function* runtimeDemandSources() {
		for (const manifest of state.moduleMetadata.symbolClaimManifests())
			yield { source: manifest.source, map: manifest.runtimeDemandMap };
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
			chunkImportMap: () =>
				internalOptions.experimentalNativePacking === true && !internalOptions.dev,
		},
		name,
		options(input: InputOptions) {
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment !== 'client') {
				return input;
			}

			return {
				...input,
				preserveEntrySignatures: packing
					? 'allow-extension'
					: (input.preserveEntrySignatures ?? 'allow-extension'),
			};
		},
		async buildStart(input) {
			if (!root) {
				root = internalOptions.rootDir ?? input.cwd;
			}
			state.reset();
			dev.reset();
			clearParsedChunkCode();

			const currentRoot = getRoot();
			if (getEnvironment(this) === 'client') {
				for (const source of clientSymbolEntries(input.input, currentRoot)) {
					clientSymbolEntrySources.add(source);
				}
			}
		},
		buildEnd: packing?.buildEnd,
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
				await generateBundleHook(context, this, bundle, output.hashCharacters);
			},
		},
		async writeBundle(output, bundle) {
			if (getEnvironment(this) !== 'client') return;
			const stale = await staleContentHashNames(bundle, {
				hashCharacters: output.hashCharacters,
			});
			if (stale.length > 0) this.error(staleChunkNamesMessage(stale));
			const unmapped = unmappedChunkSpecifiers(bundle);
			if (unmapped.length > 0)
				this.error(
					`Markless emitted chunks that import specifiers its import map does not resolve to an emitted chunk: ${unmapped.join(', ')}. A plugin changed chunk code or file names after the Markless finalize pass. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
				);
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	return plugin;
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
	outputDefaults,
} from './build/chunking.ts';
export { createBuildMetadata } from './build/build-metadata.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { collectHeadLinkInjections } from './build/head-links.ts';
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
