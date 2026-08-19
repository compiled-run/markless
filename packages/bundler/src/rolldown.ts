import type { InputOptions, Plugin } from 'rolldown';
import {
	compileTsrxModuleLinkArtifact,
	computeExecutionAttribution,
	computeLinkedInterfaces,
	delegateMaterializationScope,
	type LinkedInterfaceClaim,
	type LinkedInterfaceImport,
	type LinkedModuleChildResolution,
	linkedChildrenHaveBrowserTriggers,
	linkedImportedClaimsMissing,
	linkedImportedSymbolInputs,
	linkedManifestHasBrowserTriggers,
	linkedModuleChildDiagnostics,
	linkedModuleChildKey,
	linkedRenderDataOnlyChange,
	linkedRenderDataReachRoot,
	linkedRouteArtifactRegistration,
	planRenderDataModule,
	planTransformRequest,
	renderDataClaimManifest,
	renderDataReachImportSources,
} from '@markless/compiler';
import { dirname, resolve } from 'pathe';
import { withQuery } from 'ufo';
import { createBuildMetadata } from './build/build-metadata.ts';
import { MARKLESS_BUILD_PREFIX, MARKLESS_BUNDLE_GRAPH, outputDefaults } from './build/chunking.ts';
import { MARKLESS_EXECUTION_SIZES } from './build/execution-sizes.ts';
import { finalizeBundle } from './build/bundle-finalize.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	forceImportedModules,
	linkModuleGraph,
	materializeDelegateChildren,
	mergeLinkedModuleChildren,
	moduleIsEntry,
	resolveImportedChildren,
	resolveImportedModuleInterfaces,
	sourceSymbolManifest,
} from './link-driver.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	executionLogVirtualModuleSource,
	injectExecutionLogModuleHook,
	normalizeExecutionLogMode,
} from './execution-log.ts';
import {
	encodedSymbolSource,
	prerenderWakeVirtualModuleId,
	symbolVirtualModuleSourceFile,
} from './source-module.ts';
import type { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import {
	type ImportedChild,
	createPluginState,
	recordEmittedClaimOwnership,
	registerRenderDataStyles,
	registerTransformArtifacts,
} from './plugin-state.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	marklessVirtualModuleSourceFile,
	resumeVirtualModuleId,
	transformTsrxModule,
	transformTsrxModuleWithPrerenderWakeClosure,
} from './transform.ts';
import {
	MARKLESS_ROUTE_SOURCE_QUERY_RE,
	TSRX_SOURCE_FILE,
	clientRouteArtifactReference,
	clientSymbolEntries,
	devBrowserSourceModuleUrl,
	devBrowserVirtualModuleUrl,
	executionLogRuntimeModuleId,
	isClientPrimarySourceRequest,
	isMarklessRuntimeModule,
	isPrerenderWakeSourceRequest,
	isRelativeImport,
	isRenderDataSourceRequest,
	isResumeSourceRequest,
	isSymbolOnlySourceRequest,
	materializedReachedRenderDataSource,
	normalizeVirtualId,
	pathname,
	renderDataReachedFromQuery,
	resolveVirtualId,
	resolverVirtualModuleSourceFile,
	sourceForPrerenderWakeVirtualImporter,
	sourceForResumeVirtualImporter,
	sourceForSymbolVirtualImporter,
	sourceForTriggerGroupVirtualImporter,
	virtualModuleSourceForLoad,
} from './virtual-ids.ts';
import type {
	MarklessEnvironment,
	MarklessModuleLinkArtifact,
	MarklessRolldownOptions,
	MarklessRolldownPluginApi,
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
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

type Environment = MarklessEnvironment | ((context: unknown) => MarklessEnvironment);
export type MarklessRolldownPlugin = Plugin & { api: MarklessRolldownPluginApi };
type InternalMarklessRolldownOptions = MarklessRolldownOptions & {
	emitResumeModules?: boolean;
	inlineResumerDebug?: boolean;
	prerender?: boolean;
	productionResumeModuleUrls?: Map<string, string>;
	productionPrerenderWakeModuleUrls?: Map<string, string>;
	// Created here, not by the host: the settle chunk exists only for pages the
	// client build actually emitted one for, and the server prerender pass reads
	// the same options object back.
	productionSettleModuleUrls?: Map<string, string>;
	prerenderWakeChannel?: boolean;
	publicPath?: (fileName: string) => string;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
};

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
	const {
		virtualModules,
		moduleMetadata,
		prerenderWakeCapabilities,
		moduleLinkArtifacts,
		linkedTransformCache,
		importedChildren,
		importedChildSources,
		emittedClientResolverSources,
		clientSymbolEntrySources,
		prerenderWakeSources,
		clientRouteArtifactSources,
		clientRouteArtifactMaterializations,
		transformedClientPrimarySources,
		executionLogEstimatedSizes,
		executionLogEmittedIds,
		regeneratingVirtualModules,
		recoveringChildMetadata,
	} = state;
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

	// `resolveSpecifier`/`encodeSource` are the bundler's; the compiler pass owns
	// only the graph flattening.
	function attributionTables(manifests: Iterable<MarklessTransformManifest>) {
		return computeExecutionAttribution({
			moduleManifests: manifests,
			childTable: importedChildren.values(),
			root: getRoot(),
			resolveSpecifier: fallbackImportedSource,
			encodeSource: encodedSymbolSource,
		}).tables;
	}

	function invalidateAllGeneratedModules(
		parent: string,
		currentEnvironment?: MarklessEnvironment,
	) {
		const changedSource = pathname(parent);
		moduleLinkArtifacts.delete(changedSource);
		moduleMetadata.deleteCaptureMetadata(changedSource);
		moduleMetadata.deleteSymbolClaims(changedSource);
		prerenderWakeCapabilities.delete(changedSource);
		prerenderWakeSources.delete(changedSource);
		for (const [key, cached] of linkedTransformCache) {
			if (cached.source !== changedSource) continue;
			moduleMetadata.deleteSymbolClaims(cached.manifestSource);
			linkedTransformCache.delete(key);
		}
		const ids = dev.clear(parent, currentEnvironment);
		const resolvedIds = new Set<string>();
		for (const id of ids) {
			const type = virtualModules.get(id)?.type;
			virtualModules.delete(id);
			const resolvedId = resolveVirtualId(id);
			resolvedIds.add(resolvedId);
			if (type === 'style') resolvedIds.add(`${resolvedId}?direct`);
		}
		const invalidatesClient =
			currentEnvironment === 'client' ||
			(currentEnvironment === undefined && environment === 'client');
		if (
			invalidatesClient &&
			internalOptions.dev === true &&
			normalizeExecutionLogMode(internalOptions.executionLog) !== 'never'
		) {
			resolvedIds.add(resolveVirtualId(MARKLESS_EXECUTION_LOG_MODULE_ID));
		}
		return [...resolvedIds];
	}

	async function invalidateEditedGeneratedModules(
		parent: string,
		currentEnvironment: MarklessEnvironment | undefined,
		nextSource: string,
	) {
		const changedSource = pathname(parent);
		const cachedEntries = [...linkedTransformCache].filter(
			([key, cached]) =>
				cached.source === changedSource &&
				(!currentEnvironment || key.startsWith(`${currentEnvironment}\0`)),
		);
		if (cachedEntries.length === 0) {
			return invalidateAllGeneratedModules(parent, currentEnvironment);
		}

		const nextEntries = await Promise.all(
			cachedEntries.map(async ([key, cached]) => {
				const nextInput = { ...cached.input, source: nextSource };
				return [
					key,
					cached,
					nextInput,
					await transformTsrxModuleWithPrerenderWakeClosure(
						nextInput,
						cached.linkedChildHasBrowserTriggers,
					),
				] as const;
			}),
		);
		if (
			nextEntries.some(
				([, cached, , next]) => !linkedRenderDataOnlyChange(cached.result, next),
			)
		) {
			return invalidateAllGeneratedModules(parent, currentEnvironment);
		}

		const renderDataIds = new Set<string>();
		for (const [key, cached, nextInput, next] of nextEntries) {
			linkedTransformCache.set(key, {
				...cached,
				code: nextSource,
				input: nextInput,
				result: next,
			});
			moduleLinkArtifacts.set(changedSource, {
				moduleGraphInterface: next.moduleGraphInterface,
				interfaceHash: next.interfaceHash,
				moduleImports: next.moduleImports,
			});
			moduleMetadata.recordCaptureMetadata(changedSource, next.manifest);
			recordEmittedClaimOwnership(state, {
				source: changedSource,
				emittedModule: cached.manifestSource,
				manifest: next.manifest,
				virtualModules: next.virtualModules,
				...(isRenderDataSourceRequest(cached.manifestSource)
					? {
							overrideManifest: renderDataClaimManifest(
								next.manifest,
								cached.manifestSource,
							),
						}
					: {}),
			});
			prerenderWakeCapabilities.set(
				changedSource,
				linkedManifestHasBrowserTriggers(next.manifest) || cached.linkedChildHasBrowserTriggers,
			);
			for (const module of next.virtualModules) {
				if (module.type !== 'render-data') continue;
				virtualModules.set(module.id, module);
				renderDataIds.add(resolveVirtualId(module.id));
			}
		}
		return [...renderDataIds];
	}

	async function virtualModuleForRequest(
		normalizedId: string,
		currentEnvironment: MarklessEnvironment,
	) {
		const registered = virtualModules.get(normalizedId);
		if (registered || internalOptions.dev !== true) return registered;

		const source = marklessVirtualModuleSourceFile(normalizedId);
		if (
			!source ||
			!TSRX_SOURCE_FILE.test(source) ||
			regeneratingVirtualModules.has(normalizedId)
		) {
			return undefined;
		}

		regeneratingVirtualModules.add(normalizedId);
		try {
			// Without dropping the cached result the re-request never reaches transform.
			internalOptions.devServer?.invalidateModule?.(source, currentEnvironment);
			await internalOptions.devServer?.transformRequest(source, currentEnvironment);
		} finally {
			regeneratingVirtualModules.delete(normalizedId);
		}
		return virtualModules.get(normalizedId);
	}

	async function recoverImportedChildMetadata(
		child: ImportedChild,
		currentEnvironment: MarklessEnvironment,
	) {
		if (
			!TSRX_SOURCE_FILE.test(child.source) ||
			moduleMetadata.captureMetadataForSource(child.source) !== undefined ||
			recoveringChildMetadata.has(child.source)
		) {
			return;
		}
		recoveringChildMetadata.add(child.source);
		try {
			internalOptions.devServer?.invalidateModule?.(child.source, currentEnvironment);
			await internalOptions.devServer?.transformRequest(child.source, currentEnvironment);
		} finally {
			recoveringChildMetadata.delete(child.source);
		}
	}

	// The pass decides; composing a child it could not classify stays fail-closed.
	function throwLinkedModuleChildDiagnostics(
		children: ReadonlyArray<LinkedModuleChildResolution>,
		parentManifest?: Pick<MarklessTransformManifest, 'captureMetadata'>,
	) {
		const [diagnostic] = linkedModuleChildDiagnostics(children, {
			captureMetadataForSource: (source) => moduleMetadata.captureMetadataForSource(source),
			parentCaptureMetadataForSource: (parent) =>
				parentManifest?.captureMetadata ??
				moduleMetadata.captureMetadataForSource(pathname(parent)),
		});
		if (diagnostic) throw new Error(diagnostic.message);
	}

	const plugin = {
		api: {
			invalidateGeneratedModules(
				parent: string,
				currentEnvironment?: MarklessEnvironment,
				nextSource?: string,
			) {
				if (nextSource !== undefined) {
					return invalidateEditedGeneratedModules(parent, currentEnvironment, nextSource);
				}
				return invalidateAllGeneratedModules(parent, currentEnvironment);
			},
		},
		name,
		options(input: InputOptions) {
			const currentEnvironment = getEnvironment(this);
			if (currentEnvironment !== 'client') {
				return input;
			}

			return {
				...input,
				preserveEntrySignatures: input.preserveEntrySignatures ?? 'allow-extension',
			};
		},
		async buildStart(input) {
			if (!root) {
				root = internalOptions.rootDir ?? input.cwd;
			}
			state.reset();
			dev.reset();

			const currentRoot = getRoot();
			if (getEnvironment(this) === 'client') {
				for (const source of clientSymbolEntries(input.input, currentRoot)) {
					clientSymbolEntrySources.add(source);
				}
			}
		},
		outputOptions(output) {
			return outputDefaults(output, getEnvironment(this));
		},
		async resolveId(source, importer) {
			// Emitted modules import runtime catalog functions as '@markless/web/fns/*'
			// and conditional inline helpers as '@markless/web/inline/*'.
			// Apps depend on @markless/core only, so the bundler resolves the catalog
			// from its own dependency on @markless/web (generated-code-only surface).
			if (source.startsWith('@markless/web/fns/')) {
				const resolved = import.meta.resolve(source);
				if (resolved?.startsWith('file://')) {
					return { id: decodeURIComponent(resolved.slice('file://'.length)) };
				}
			}
			if (source.startsWith('@markless/web/inline/')) {
				const resolvedRoot = import.meta.resolve('@markless/web');
				if (resolvedRoot?.startsWith('file://') && resolvedRoot.endsWith('/index.ts')) {
					const helperPath = source.slice('@markless/web/'.length);
					return {
						id: decodeURIComponent(
							resolvedRoot.slice('file://'.length, -'index.ts'.length) +
								`${helperPath}.ts`,
						),
					};
				}
			}
			const normalized = normalizeVirtualId(source);
			if (normalized === MARKLESS_EXECUTION_LOG_MODULE_ID) {
				return {
					id: resolveVirtualId(MARKLESS_EXECUTION_LOG_MODULE_ID),
					moduleSideEffects: true,
				};
			}
			const virtualModule = await virtualModuleForRequest(normalized, getEnvironment(this));
			if (virtualModule) {
				const directQuery =
					virtualModule.type === 'style' && /(?:[?&])direct(?:[=&]|$)/.test(source)
						? '?direct'
						: '';
				return {
					id: `${resolveVirtualId(normalized)}${directQuery}`,
					moduleSideEffects: true,
				};
			}
			const missingSymbolSource = symbolVirtualModuleSourceFile(normalized);
			if (missingSymbolSource && importedChildSources.has(missingSymbolSource)) {
				throw new Error(
					`MARKLESS_CHILD_SYMBOL_MISSING: Linked child ${JSON.stringify(missingSymbolSource)} does not provide requested symbol module ${JSON.stringify(normalized)}. Rebuild the child with the current Markless compiler and clear any stale build cache.`,
				);
			}

			const symbolSource = sourceForSymbolVirtualImporter(importer);
			if (symbolSource && isRelativeImport(source)) {
				return await this.resolve(source, symbolSource, { skipSelf: true });
			}
			const triggerGroupSource = sourceForTriggerGroupVirtualImporter(importer);
			if (triggerGroupSource && isRelativeImport(source)) {
				return await this.resolve(source, triggerGroupSource, { skipSelf: true });
			}
			const resumeSource =
				sourceForResumeVirtualImporter(importer) ??
				sourceForPrerenderWakeVirtualImporter(importer);
			if (resumeSource && isRelativeImport(source)) {
				return await this.resolve(source, resumeSource, { skipSelf: true });
			}

			return null;
		},
		async load(id) {
			if (normalizeVirtualId(id) === MARKLESS_EXECUTION_LOG_MODULE_ID) {
				const embedsDevSizes =
					internalOptions.dev === true && getEnvironment(this) === 'client';
				return executionLogVirtualModuleSource({
					moduleSizes: embedsDevSizes ? executionLogEstimatedSizes : undefined,
					attribution: embedsDevSizes
						? attributionTables(moduleMetadata.symbolClaimMap().values())
						: undefined,
					sizesUrl:
						internalOptions.dev === true
							? undefined
							: (internalOptions.publicPath?.(MARKLESS_EXECUTION_SIZES) ??
								`/${MARKLESS_EXECUTION_SIZES}`),
				});
			}
			const normalizedId = normalizeVirtualId(id);
			const resolverSource = resolverVirtualModuleSourceFile(normalizedId);
			if (
				resolverSource &&
				getEnvironment(this) === 'client' &&
				internalOptions.dev !== true &&
				internalOptions.prerenderWakeChannel === true &&
				typeof this.getModuleInfo === 'function'
			) {
				const queryClaimSources = [
					withQuery(resolverSource, { 'markless-resume': null }),
					withQuery(resolverSource, { 'markless-prerender-wake': null }),
					withQuery(resolverSource, { 'markless-symbols': null }),
				];
				moduleMetadata.expectSourceSymbolClaims(
					resolverSource,
					queryClaimSources.filter((source) => this.getModuleInfo(source) != null),
				);
				await moduleMetadata.sealSourceSymbolClaims(resolverSource);
			}
			const module = await virtualModuleForRequest(normalizedId, getEnvironment(this));
			if (module) {
				return virtualModuleSourceForLoad(module, {
					dev: internalOptions.dev === true && getEnvironment(this) === 'client',
					publicPath: internalOptions.publicPath,
				});
			}
			return null;
		},
		async transform(code, id) {
			const currentEnvironment = getEnvironment(this);
			const virtualId = normalizeVirtualId(id);
			if (!TSRX_SOURCE_FILE.test(id)) {
				if (
					currentEnvironment === 'client' &&
					internalOptions.dev !== true &&
					internalOptions.prerender === true &&
					normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
					this.getModuleInfo(id)?.isEntry === true
				) {
					return {
						code: `${code}\nglobalThis.__mxLoadLog ||= () => import(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});\nglobalThis.__mxLoadLog().then(log => log.logMarklessRenderSummary());`,
						map: null,
					};
				}
				// Hooks follow the log mode, not `dev`: the printer and the size
				// map already ship in `auto`, so a dev-only hook gate made the
				// console structurally blind in every built page.
				if (
					currentEnvironment === 'client' &&
					normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
					isMarklessRuntimeModule(id)
				) {
					executionLogEstimatedSizes.set(executionLogRuntimeModuleId(id), code.length);
					executionLogEmittedIds.set(executionLogRuntimeModuleId(id), pathname(id));
					return {
						code: injectExecutionLogModuleHook(
							code,
							executionLogRuntimeModuleId(id),
							internalOptions.executionLog,
						),
						map: null,
					};
				}
				return null;
			}
			if (virtualId.startsWith(MARKLESS_VIRTUAL_PREFIX)) {
				return null;
			}
			const source = pathname(id);
			const renderDataRequest = isRenderDataSourceRequest(id);
			const prerenderWakeRequest = isPrerenderWakeSourceRequest(id);
			const clientRouteArtifact = MARKLESS_ROUTE_SOURCE_QUERY_RE.test(id);
			const materializedRenderDataReach =
				currentEnvironment === 'client' && renderDataRequest
					? linkedRenderDataReachRoot({
							source,
							materializedSources: clientRouteArtifactMaterializations,
							reachedFrom: renderDataReachedFromQuery(id),
						})
					: undefined;
			if (currentEnvironment === 'client' && prerenderWakeRequest) {
				clientSymbolEntrySources.add(source);
				prerenderWakeSources.add(source);
			}
			const clientOutput =
				currentEnvironment === 'client' &&
				((clientSymbolEntrySources.has(source) &&
					internalOptions.prerender !== true &&
					!clientRouteArtifactSources.has(source) &&
					isClientPrimarySourceRequest(id) &&
					moduleIsEntry(this, id)) ||
					isSymbolOnlySourceRequest(id))
					? ('symbols-only' as const)
					: undefined;
			const plan = planTransformRequest({
				environment: currentEnvironment,
				source,
				requestId: id,
				request: {
					resume: isResumeSourceRequest(id),
					prerenderWake: prerenderWakeRequest,
					renderData: renderDataRequest,
					routeArtifact: clientRouteArtifact,
					clientPrimary: isClientPrimarySourceRequest(id),
				},
				options: {
					dev: internalOptions.dev === true,
					prerender: internalOptions.prerender === true,
					prerenderWakeChannel: internalOptions.prerenderWakeChannel === true,
				},
				hasWakeSources: prerenderWakeSources.size > 0,
				renderDataReached: materializedRenderDataReach !== undefined,
				routeArtifactSource: clientRouteArtifactSources.has(source),
				clientOutput,
				getModuleInfoAvailable: typeof this.getModuleInfo === 'function',
			});
			const { cacheKey, manifestSource, prerenderRecords, publishesClientClaims } = plan;
			const transformInput: TransformTsrxModuleInput = {
				filename: source,
				source: code,
				dev: plan.dev,
				buildId: internalOptions.buildId,
				executionLog: normalizeExecutionLogMode(internalOptions.executionLog),
				executionLogModuleHooks:
					currentEnvironment === 'client' &&
					normalizeExecutionLogMode(internalOptions.executionLog) !== 'never',
				inlineResumerDebug: internalOptions.inlineResumerDebug === true,
				prerenderRecords,
				directCsr:
					currentEnvironment === 'client' &&
					internalOptions.emitResumeModules !== true &&
					internalOptions.prerender !== true &&
					!renderDataRequest &&
					!prerenderWakeRequest &&
					!isResumeSourceRequest(id) &&
					!isSymbolOnlySourceRequest(id) &&
					!clientRouteArtifact,
				runtimeDemandClass:
					currentEnvironment === 'client' &&
					internalOptions.emitResumeModules === true &&
					!prerenderRecords &&
					!clientRouteArtifactSources.has(source)
						? 'plain-ssr'
						: 'prerender',
				prerenderWakeVariant:
					internalOptions.prerenderWakeChannel === true &&
					(prerenderWakeRequest ||
						(plan.ssrPrerenderArtifacts && clientSymbolEntrySources.has(source))),
				prerenderWakeFacade: prerenderWakeRequest,
				preserveWakeSiblingClaims:
					currentEnvironment === 'client' &&
					(isResumeSourceRequest(id) || isSymbolOnlySourceRequest(id)),
				environment: currentEnvironment,
				clientOutput,
				// Dev resume URL points at the SOURCE module (not the virtual resume
				// module): loading the .tsrx keeps it in the client module graph, which
				// is what lets Vite's own no-accepting-boundary full-reload fire on
				// edits (commit e3c5bcc's design). The source client module re-exports
				// resumeContainerEvent from the virtual resume module in dev only;
				// production builds keep the split (CSR emits no resume code).
				resumeModuleUrl:
					internalOptions.dev === true && currentEnvironment === 'server'
						? devBrowserSourceModuleUrl(source, getRoot(), internalOptions.publicPath)
						: currentEnvironment === 'server'
							? internalOptions.productionResumeModuleUrls?.get(source)
							: undefined,
				prerenderWakeModuleUrl:
					currentEnvironment === 'server'
						? internalOptions.productionPrerenderWakeModuleUrls?.get(source)
						: undefined,
				settleModuleUrl:
					currentEnvironment === 'server'
						? internalOptions.productionSettleModuleUrls?.get(source)
						: undefined,
				styleModuleUrl:
					internalOptions.dev === true && currentEnvironment === 'server'
						? (virtualId) =>
								withQuery(
									devBrowserVirtualModuleUrl(
										virtualId,
										internalOptions.publicPath,
									),
									{
										direct: null,
									},
								)
						: undefined,
				headInjections:
					internalOptions.dev === true && currentEnvironment === 'server'
						? internalOptions.devInjections
						: undefined,
				devResumeReexport: plan.devResumeReexport,
				prerenderRecordData:
					currentEnvironment === 'client'
						? input.prerenderRecordsBySource?.get(source)
						: undefined,
			};
			if (publishesClientClaims) {
				moduleMetadata.beginSourceSymbolClaims(source, manifestSource);
			}
			const cached = linkedTransformCache.get(cacheKey);
			let linkedTransformResult: TransformTsrxModuleResult | undefined;
			let linkedTransformInput = transformInput;
			let reusedLinkedTransform = false;
			if (cached?.code === code) {
				const cachedImports = await resolveImportedModuleInterfaces(
					this,
					manifestSource,
					cached.result.moduleImports,
					fallbackImportedSource,
				);
				await forceImportedModules(
					this,
					cachedImports,
					moduleLinkArtifacts,
					moduleMetadata,
					internalOptions,
					currentEnvironment,
				);
				const cachedLink = linkedInterfaces(
					cachedImports,
					moduleLinkArtifacts,
					linkedInterfaceClaims(cachedImports, moduleMetadata),
				);
				if (
					cached.importedInterfaceHashes === cachedLink.signature &&
					cached.importedSymbolClaims === cachedLink.claimSignature
				) {
					linkedTransformResult = cached.result;
					linkedTransformInput = cached.input;
					reusedLinkedTransform = true;
				}
			}
			// Same predicate as `!reusedLinkedTransform`, phrased so the result is provably assigned.
			if (linkedTransformResult === undefined) {
				try {
					linkedTransformResult = await transformTsrxModule(transformInput);
				} catch (error) {
					// Imported graph helpers can diagnose before their interface is linked.
					// Publish only this compiler-owned link artifact so cycles never wait.
					const provisional = await compileTsrxModuleLinkArtifact(transformInput);
					moduleLinkArtifacts.set(source, provisional);
					const provisionalImports = await resolveImportedModuleInterfaces(
						this,
						manifestSource,
						provisional.moduleImports,
						fallbackImportedSource,
					);
					if (provisionalImports.length === 0) throw error;
					await forceImportedModules(
						this,
						provisionalImports,
						moduleLinkArtifacts,
						moduleMetadata,
						internalOptions,
						currentEnvironment,
					);
					linkedTransformInput = {
						...transformInput,
						importedModuleInterfaces: linkModuleGraph(provisionalImports, {
							moduleArtifacts: moduleLinkArtifacts,
							metadata: moduleMetadata,
						}).interfaces,
					};
					linkedTransformResult = await transformTsrxModule(linkedTransformInput);
				}
			}
			let transformed: TransformTsrxModuleResult = linkedTransformResult;
			if (currentEnvironment === 'client' && clientRouteArtifact) {
				const artifactChildMaterializations = await materializeDelegateChildren(
					this,
					source,
					transformed.artifactChildren,
				);
				if (Object.keys(artifactChildMaterializations).length > 0) {
					clientRouteArtifactMaterializations.set(source, artifactChildMaterializations);
				}
				registerClientRouteArtifactSource(source);
				return {
					code: clientRouteArtifactReference(source),
					map: null,
				};
			}
			if (!reusedLinkedTransform) {
				const artifactChildMaterializations =
					currentEnvironment === 'client' &&
					clientRouteArtifactMaterializations.has(source)
						? clientRouteArtifactMaterializations.get(source)!
						: delegateMaterializationScope({
									clientEnvironment: currentEnvironment === 'client',
									symbolOnlyRequest: isSymbolOnlySourceRequest(id),
									moduleEntry: moduleIsEntry(this, id),
									renderDataReached: materializedRenderDataReach !== undefined,
								})
							? await materializeDelegateChildren(
									this,
									source,
									transformed.artifactChildren,
								)
							: {};
				if (Object.keys(artifactChildMaterializations).length > 0) {
					linkedTransformInput = {
						...linkedTransformInput,
						artifactChildMaterializations,
					};
					transformed = await transformTsrxModuleWithPrerenderWakeClosure(
						linkedTransformInput,
						false,
					);
				}
			}
			// Register the first-pass artifact before loading children so the existing
			// cross-module registry can validate both sides of the composition edge.
			if (!renderDataRequest) {
				registerTransformArtifacts(state, {
					owner: cacheKey,
					source,
					manifestSource,
					result: transformed,
					dev,
					environment: currentEnvironment,
					finalPublication: false,
					tracksSourceClaimPublication: false,
					updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
				});
			} else {
				moduleMetadata.recordCaptureMetadata(source, transformed.manifest);
				moduleMetadata.recordSymbolClaims(
					manifestSource,
					renderDataClaimManifest(transformed.manifest, manifestSource),
				);
				moduleLinkArtifacts.set(source, {
					interfaceHash: transformed.interfaceHash,
					moduleGraphInterface: transformed.moduleGraphInterface,
					moduleImports: transformed.moduleImports,
				});
			}
			const resolvedInterfaceImports = await resolveImportedModuleInterfaces(
				this,
				manifestSource,
				transformed.moduleImports,
				fallbackImportedSource,
			);
			const resolvedChildren = await resolveImportedChildren(
				this,
				manifestSource,
				transformed.manifest,
				fallbackImportedSource,
			);
			for (const child of resolvedChildren) {
				linkedChildren.set(linkedModuleChildKey(child), child);
				importedChildSources.add(child.source);
			}
			await forceImportedModules(
				this,
				mergeLinkedModuleChildren(resolvedInterfaceImports, resolvedChildren),
				moduleLinkArtifacts,
				moduleMetadata,
				internalOptions,
				currentEnvironment,
			);
			for (const child of resolvedChildren) {
				if (internalOptions.dev === true) {
					await recoverImportedChildMetadata(child, currentEnvironment);
					throwLinkedModuleChildDiagnostics([child], transformed.manifest);
				}
			}
			const linkedChildHasBrowserTriggers = linkedChildrenHaveBrowserTriggers({
				children: resolvedChildren,
				symbolClaimsForSource: (source) => sourceSymbolManifest(moduleMetadata, source),
				browserTriggerCapability: (source) => prerenderWakeCapabilities.get(source),
			});
			if (
				!reusedLinkedTransform &&
				(resolvedChildren.length > 0 || resolvedInterfaceImports.length > 0)
			) {
				const symbols = linkedImportedSymbolInputs({
					children: resolvedChildren,
					captureMetadataForSource: (source) =>
						moduleMetadata.captureMetadataForSource(source),
					symbolClaimsForSource: (source) => sourceSymbolManifest(moduleMetadata, source),
				});
				const linkedGraph = linkModuleGraph(resolvedInterfaceImports, {
					moduleArtifacts: moduleLinkArtifacts,
					metadata: moduleMetadata,
					parentManifest: transformed.manifest,
					...(materializedRenderDataReach
						? {
								renderDataReachRoot: materializedRenderDataReach,
								reachedRenderDataSource: materializedReachedRenderDataSource,
							}
						: {}),
				});
				const renderDataImportSources = materializedRenderDataReach
					? renderDataReachImportSources(linkedGraph)
					: undefined;
				linkedTransformInput = {
					...linkedTransformInput,
					symbols,
					importedModuleInterfaces: linkedGraph.interfaces,
					...(renderDataImportSources ? { renderDataImportSources } : {}),
				};
				transformed = await transformTsrxModuleWithPrerenderWakeClosure(
					linkedTransformInput,
					linkedChildHasBrowserTriggers,
				);
			}
			prerenderWakeCapabilities.set(
				source,
				plan.wakeCapability(
					linkedManifestHasBrowserTriggers(transformed.manifest),
					linkedChildHasBrowserTriggers,
				),
			);
			if (plan.aggregateEligible) {
				const aggregateInput = {
					...linkedTransformInput,
					clientOutput: undefined,
					prerenderWakeFacade: false,
					prerenderWakeVariant: false,
				};
				let aggregate = await transformTsrxModuleWithPrerenderWakeClosure(
					aggregateInput,
					linkedChildHasBrowserTriggers,
				);
				const aggregateChildren = await resolveImportedChildren(
					this,
					source,
					aggregate.manifest,
					fallbackImportedSource,
				);
				await forceImportedModules(
					this,
					aggregateChildren,
					moduleLinkArtifacts,
					moduleMetadata,
					internalOptions,
					currentEnvironment,
				);
				const aggregateSymbolInputs = () =>
					linkedImportedSymbolInputs({
						children: aggregateChildren,
						captureMetadataForSource: (child) =>
							moduleMetadata.captureMetadataForSource(child),
						symbolClaimsForSource: (child) => sourceSymbolManifest(moduleMetadata, child),
					});
				let aggregateSymbols = aggregateSymbolInputs();
				for (
					let attempt = 0;
					linkedImportedClaimsMissing({
						children: aggregateChildren,
						symbols: aggregateSymbols,
						captureMetadataForSource: (child) =>
							moduleMetadata.captureMetadataForSource(child),
					});
					attempt += 1
				) {
					if (attempt === 9) {
						throw new Error(
							`MARKLESS_IMPORTED_SYMBOL_CLAIMS_UNREADY: Source ${JSON.stringify(source)} could not seal imported symbol claims after final publications.`,
						);
					}
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
					for (const child of aggregateChildren) {
						await moduleMetadata.sealSourceSymbolClaims(child.source);
					}
					aggregateSymbols = aggregateSymbolInputs();
				}
				aggregate = await transformTsrxModuleWithPrerenderWakeClosure(
					{
						...aggregateInput,
						symbols: aggregateSymbols,
					},
					linkedChildHasBrowserTriggers,
				);
				const resolver = aggregate.virtualModules.find(
					(module) => module.type === 'resolver',
				);
				if (resolver) {
					transformed = {
						...transformed,
						virtualModules: transformed.virtualModules.map((module) =>
							module.type === 'resolver' ? resolver : module,
						),
					};
				}
			}
			if (!renderDataRequest)
				registerTransformArtifacts(state, {
					owner: cacheKey,
					source,
					manifestSource,
					result: transformed,
					dev,
					environment: currentEnvironment,
					finalPublication: true,
					tracksSourceClaimPublication: publishesClientClaims,
					replaceOwnedArtifacts: true,
					updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
				});
			else {
				moduleMetadata.recordCaptureMetadata(source, transformed.manifest);
				moduleMetadata.recordSymbolClaims(
					manifestSource,
					renderDataClaimManifest(transformed.manifest, manifestSource),
				);
			}
			linkedTransformCache.set(cacheKey, {
				source,
				manifestSource,
				code,
				importedInterfaceHashes: linkedInterfaces(resolvedInterfaceImports, moduleLinkArtifacts)
					.signature,
				importedSymbolClaims: linkedInterfaces(
					resolvedInterfaceImports,
					moduleLinkArtifacts,
					linkedInterfaceClaims(
						mergeLinkedModuleChildren(resolvedInterfaceImports, resolvedChildren),
						moduleMetadata,
					),
				).claimSignature,
				input: linkedTransformInput,
				result: transformed,
				linkedChildHasBrowserTriggers,
			});
			if (currentEnvironment === 'client' && isClientPrimarySourceRequest(id)) {
				transformedClientPrimarySources.add(source);
			}
			if (currentEnvironment === 'client' && renderDataRequest) {
				const renderDataModule = transformed.virtualModules.find(
					(module) => module.type === 'render-data',
				);
				if (renderDataModule) {
					const styleModules = transformed.virtualModules.filter(
						(module) => module.type === 'style',
					);
					registerRenderDataStyles(state, {
						owner: cacheKey,
						source,
						modules: styleModules,
						dev,
					});
					const renderData = planRenderDataModule({
						source,
						emittedModule: manifestSource,
						moduleSource: renderDataModule.source,
						styleModules: styleModules.map((module) => module.id),
						manifest: transformed.manifest,
						linkedModules: virtualModules.keys(),
					});
					throwIfRenderDataUnlinked(renderData);
					return {
						code: [
							...renderData.styleModules.map(
								(styleModule) => `import ${JSON.stringify(styleModule)};`,
							),
							renderDataModule.source,
						].join('\n'),
						map: null,
					};
				}
			}
			for (const child of resolvedChildren) {
				dev.record(
					child.source,
					[transformed.manifest.resolver.virtualModuleId],
					currentEnvironment,
				);
			}
			if (currentEnvironment === 'client' && isResumeSourceRequest(id)) {
				const resumeModule = transformed.virtualModules.find(
					(module) => module.type === 'resume',
				);
				if (resumeModule) return { code: resumeModule.source, map: null };
			}
			if (currentEnvironment === 'client' && prerenderWakeRequest) {
				const wakeModule = transformed.virtualModules.find(
					(module) => module.type === 'prerender-wake',
				);
				return wakeModule
					? {
							code: `export { resumeContainerEvent } from ${JSON.stringify(wakeModule.id)};`,
							map: null,
						}
					: {
							code: [
								'export async function resumeContainerEvent() {',
								"\tthrow new Error('MARKLESS_PRERENDER_WAKE_ROUTE_INELIGIBLE');",
								'}',
							].join('\n'),
							map: null,
						};
			}

			if (currentEnvironment === 'client' && !internalOptions.dev) {
				for (const module of transformed.virtualModules.filter((item) => {
					if (item.type === 'symbol') return true;
					if (item.type === 'trigger-group') return true;
					if (item.type === 'settle') return clientSymbolEntrySources.has(source);
					if (item.type === 'resolver') {
						return (
							(importedChildSources.has(source) ||
								(transformed.manifest.captureMetadata?.boundResolverRows?.length ??
									0) > 0) &&
							!emittedClientResolverSources.has(source)
						);
					}
					return (
						(item.type === 'resume' || item.type === 'prerender-wake') &&
						internalOptions.emitResumeModules === true &&
						clientSymbolEntrySources.has(source)
					);
				})) {
					this.emitFile({
						type: 'chunk',
						id: module.id,
						preserveSignature: 'strict',
					});
					if (module.type === 'resolver') {
						emittedClientResolverSources.add(source);
					}
				}
			}

			return transformed;
		},
		generateBundle: {
			order: 'post',
			async handler(_, bundle) {
				throwLinkedModuleChildDiagnostics([...linkedChildren.values()]);
				if (getEnvironment(this) !== 'client') return;
				await finalizeBundle(this, bundle, {
					options: internalOptions,
					moduleMetadata,
					root: getRoot(),
					executionLogEmittedIds,
					executionAttributionTables: attributionTables,
				});
			},
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	// Applies the `claim-manifest` route-artifact verdict: the pass decides whether
	// a source may still take ownership, the plugin performs the invalidation.
	function registerClientRouteArtifactSource(source: string) {
		const registration = linkedRouteArtifactRegistration({
			source,
			registered: clientRouteArtifactSources.has(source),
			primaryTransformed: transformedClientPrimarySources.has(source),
			dev: internalOptions.dev === true,
		});
		if (registration.action === 'already-registered') return;
		if (registration.action === 'late') throw new Error(registration.diagnostics[0]!.message);
		if (registration.action === 'reinvalidate') {
			invalidateAllGeneratedModules(source, 'client');
			transformedClientPrimarySources.delete(source);
			internalOptions.devServer?.invalidateModule?.(source, 'client');
		}
		clientRouteArtifactSources.add(source);
	}

	return plugin;
}

// Resolution and path math stay with the bundler by the ruling's own list of
// bundler concepts; the `module-link` pass reads the resulting table.
function fallbackImportedSource(parent: string, specifier: string): string {
	const source = specifier.split('?')[0]!;
	return isRelativeImport(source) ? resolve(dirname(parent), source) : source;
}

function linkedInterfaces(
	imports: ReadonlyArray<LinkedModuleChildResolution>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	claims: ReadonlyArray<LinkedInterfaceClaim> = [],
) {
	return computeLinkedInterfaces({
		imports: imports.map(
			(imported): LinkedInterfaceImport => ({
				specifier: imported.specifier,
				source: imported.source,
				interfaceHash: artifacts.get(imported.source)?.interfaceHash,
				moduleInterface: artifacts.get(imported.source)?.moduleGraphInterface,
			}),
		),
		claims,
	});
}

function linkedInterfaceClaims(
	imports: ReadonlyArray<LinkedModuleChildResolution>,
	metadata: ModuleMetadataRegistry,
): LinkedInterfaceClaim[] {
	return imports.map((imported) => ({
		source: imported.source,
		symbols: sourceSymbolManifest(metadata, imported.source)?.symbols ?? [],
	}));
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'markless:rolldown';
	}

	return `markless:rolldown:${environment}`;
}

// A render-data module that links a scoped style this build never registered
// would ship markup with no CSS behind it, so the pass diagnostic fails the
// load rather than serving the silent version.
function throwIfRenderDataUnlinked(renderData: {
	readonly diagnostics: ReadonlyArray<{ readonly message: string }>;
}) {
	const unlinked = renderData.diagnostics[0];
	if (unlinked) throw new Error(unlinked.message);
}




export { MARKLESS_BUNDLE_GRAPH, MARKLESS_BUILD_PREFIX, outputDefaults } from './build/chunking.ts';
export { createBuildMetadata } from './build/build-metadata.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { collectHeadLinkInjections } from './build/head-links.ts';
export {
	MARKLESS_VIRTUAL_PREFIX,
	prerenderWakeVirtualModuleId,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
