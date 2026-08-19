import type { InputOptions, Plugin } from 'rolldown';
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, isAbsolute, relative, resolve } from 'pathe';
import { withQuery } from 'ufo';
import { createBuildMetadata } from './build/build-metadata.ts';
import { MARKLESS_BUILD_PREFIX, MARKLESS_BUNDLE_GRAPH, outputDefaults } from './build/chunking.ts';
import { MARKLESS_EXECUTION_SIZES } from './build/execution-sizes.ts';
import { finalizeBundle } from './build/bundle-finalize.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	executionLogVirtualModuleSource,
	hasExecutionLogModuleHook,
	injectExecutionLogModuleHook,
	normalizeExecutionLogMode,
	requalifyExecutionLogModuleHook,
} from './execution-log.ts';
import {
	encodedSymbolSource,
	prerenderWakeVirtualModuleId,
	symbolVirtualModuleSourceFile,
} from './source-module.ts';
import type { ModuleMetadataRegistry } from './module-metadata-registry.ts';
import { type ImportedChild, createPluginState } from './plugin-state.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	compileTsrxModuleLinkArtifact,
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
	materializedRenderDataReachRoot,
	normalizeVirtualId,
	pathname,
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
	ArtifactChildCandidate,
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
		transformVirtualModules,
		virtualModuleOwners,
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
				([, cached, , next]) => !isRenderDataOnlyTransformChange(cached.result, next),
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
			const symbolClaim = emittedSymbolClaim(
				moduleMetadata,
				changedSource,
				cached.manifestSource,
				next.manifest,
				next.virtualModules,
			);
			moduleMetadata.recordSymbolClaims(
				symbolClaim.owner,
				isRenderDataSourceRequest(cached.manifestSource)
					? renderDataClaimManifest(next.manifest, cached.manifestSource)
					: symbolClaim.manifest,
			);
			prerenderWakeCapabilities.set(
				changedSource,
				manifestHasBrowserTriggers(next.manifest) || cached.linkedChildHasBrowserTriggers,
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
						? executionAttributionTables(
								moduleMetadata.symbolClaimMap().values(),
								getRoot(),
								importedChildren.values(),
							)
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
					? materializedRenderDataReachRoot(
							id,
							source,
							clientRouteArtifactMaterializations,
						)
					: undefined;
			if (currentEnvironment === 'client' && prerenderWakeRequest) {
				clientSymbolEntrySources.add(source);
				prerenderWakeSources.add(source);
			}
			// Children reshape only when this build actually has wake-variant
			// entries; router apps have none until their entry channel exists,
			// and reshaping their children alone ships dead bytes into walls.
			// Router apps signal wake eligibility through per-page wake requests
			// rather than the SSR symbol input, so either signal opens the gate.
			// With the router wake channel, every client transform is prerender
			// shaped (same order-independent semantics as MARKLESS_PRERENDER=1):
			// wake requests arrive after package children are already cached.
			// The wake channel (env-captured at plugin construction, or the
			// router's late per-page wake requests) is the ONLY trigger: bare
			// emitResumeModules must not reshape ordinary SSR apps — their
			// symbol-route pages would inherit prerenderDataId and the no-op
			// container-event stub, silently swallowing clicks.
			const ssrPrerenderArtifacts =
				currentEnvironment === 'client' &&
				(internalOptions.prerenderWakeChannel === true || prerenderWakeSources.size > 0);
			const prerenderRecords =
				currentEnvironment === 'client' &&
				(internalOptions.prerender === true ||
					internalOptions.prerenderWakeChannel === true ||
					materializedRenderDataReach !== undefined ||
					prerenderWakeRequest ||
					ssrPrerenderArtifacts);
			const transformInput: TransformTsrxModuleInput = {
				filename: source,
				source: code,
				dev:
					internalOptions.dev === true ||
					(currentEnvironment === 'client' && clientRouteArtifactSources.has(source)),
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
						(ssrPrerenderArtifacts && clientSymbolEntrySources.has(source))),
				prerenderWakeFacade: prerenderWakeRequest,
				preserveWakeSiblingClaims:
					currentEnvironment === 'client' &&
					(isResumeSourceRequest(id) || isSymbolOnlySourceRequest(id)),
				environment: currentEnvironment,
				clientOutput:
					currentEnvironment === 'client' &&
					((clientSymbolEntrySources.has(source) &&
						internalOptions.prerender !== true &&
						!clientRouteArtifactSources.has(source) &&
						isClientPrimarySourceRequest(id) &&
						isModuleEntry(this, id)) ||
						isSymbolOnlySourceRequest(id))
						? 'symbols-only'
						: undefined,
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
				devResumeReexport: internalOptions.dev === true && currentEnvironment === 'client',
				prerenderRecordData:
					currentEnvironment === 'client'
						? input.prerenderRecordsBySource?.get(source)
						: undefined,
			};
			const manifestSource =
				currentEnvironment === 'client' && !isClientPrimarySourceRequest(id) ? id : source;
			const publishesClientClaims =
				currentEnvironment === 'client' && !renderDataRequest && !clientRouteArtifact;
			if (publishesClientClaims) {
				moduleMetadata.beginSourceSymbolClaims(source, manifestSource);
			}
			// One source can be requested as a full environment entry, a symbols-only
			// interaction entry, or a dev resume entry. Their linked interfaces are the
			// same, but their emitted module shapes are deliberately different.
			const cacheKey = [
				currentEnvironment,
				manifestSource,
				transformInput.clientOutput ?? 'full',
				isResumeSourceRequest(id)
					? 'resume'
					: prerenderWakeRequest
						? 'prerender-wake'
						: renderDataRequest
							? 'render-data'
							: 'source',
			].join('\0');
			const cached = linkedTransformCache.get(cacheKey);
			let linkedTransformResult: TransformTsrxModuleResult | undefined;
			let linkedTransformInput = transformInput;
			let reusedLinkedTransform = false;
			if (cached?.code === code) {
				const cachedImports = await resolveImportedModuleInterfaces.call(
					this,
					manifestSource,
					cached.result.moduleImports,
				);
				await forceImportedModules.call(
					this,
					cachedImports,
					moduleLinkArtifacts,
					moduleMetadata,
					internalOptions,
					currentEnvironment,
				);
				if (
					cached.importedInterfaceHashes ===
						importedInterfaceHashSignature(cachedImports, moduleLinkArtifacts) &&
					cached.importedSymbolClaims ===
						importedSymbolClaimSignature(cachedImports, moduleMetadata)
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
					const provisionalImports = await resolveImportedModuleInterfaces.call(
						this,
						manifestSource,
						provisional.moduleImports,
					);
					if (provisionalImports.length === 0) throw error;
					await forceImportedModules.call(
						this,
						provisionalImports,
						moduleLinkArtifacts,
						moduleMetadata,
						internalOptions,
						currentEnvironment,
					);
					linkedTransformInput = {
						...transformInput,
						importedModuleInterfaces: importedModuleInterfaces(
							provisionalImports,
							moduleLinkArtifacts,
						),
					};
					linkedTransformResult = await transformTsrxModule(linkedTransformInput);
				}
			}
			let transformed: TransformTsrxModuleResult = linkedTransformResult;
			if (currentEnvironment === 'client' && clientRouteArtifact) {
				const artifactChildMaterializations = await materializeArtifactChildren.call(
					this,
					source,
					getRoot(),
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
				// Only client page composition materializes artifact children.
				const pageRoot =
					currentEnvironment === 'client' &&
					!isSymbolOnlySourceRequest(id) &&
					isModuleEntry(this, id);
				const artifactChildMaterializations =
					currentEnvironment === 'client' &&
					clientRouteArtifactMaterializations.has(source)
						? clientRouteArtifactMaterializations.get(source)!
						: pageRoot || materializedRenderDataReach !== undefined
							? await materializeArtifactChildren.call(
									this,
									source,
									getRoot(),
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
				registerTransformArtifacts({
					owner: cacheKey,
					source,
					manifestSource,
					result: transformed,
					virtualModules,
					moduleMetadata,
					moduleLinkArtifacts,
					transformVirtualModules,
					virtualModuleOwners,
					executionLogEstimatedSizes,
					executionLogEmittedIds,
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
			const resolvedInterfaceImports = await resolveImportedModuleInterfaces.call(
				this,
				manifestSource,
				transformed.moduleImports,
			);
			const resolvedChildren = await resolveImportedChildren.call(
				this,
				manifestSource,
				transformed.manifest,
			);
			for (const child of resolvedChildren) {
				importedChildren.set(importedChildKey(child), child);
				importedChildSources.add(child.source);
			}
			await forceImportedModules.call(
				this,
				uniqueImportedModules([...resolvedInterfaceImports, ...resolvedChildren]),
				moduleLinkArtifacts,
				moduleMetadata,
				internalOptions,
				currentEnvironment,
			);
			for (const child of resolvedChildren) {
				if (internalOptions.dev === true) {
					await recoverImportedChildMetadata(child, currentEnvironment);
					validateImportedChild(child, moduleMetadata, transformed.manifest);
				}
			}
			const linkedChildHasBrowserTriggers = linkedChildrenHaveBrowserTriggers(
				resolvedChildren,
				moduleMetadata,
				prerenderWakeCapabilities,
			);
			if (
				!reusedLinkedTransform &&
				(resolvedChildren.length > 0 || resolvedInterfaceImports.length > 0)
			) {
				const symbols = importedSymbolInputs(resolvedChildren, moduleMetadata);
				const renderDataImportSources = materializedRenderDataReach
					? Object.fromEntries(
							resolvedInterfaceImports.map((imported) => [
								imported.specifier,
								materializedReachedRenderDataSource(
									imported.source,
									materializedRenderDataReach,
								),
							]),
						)
					: undefined;
				linkedTransformInput = {
					...linkedTransformInput,
					symbols,
					importedModuleInterfaces: importedModuleInterfaces(
						resolvedInterfaceImports,
						moduleLinkArtifacts,
					),
					...(renderDataImportSources ? { renderDataImportSources } : {}),
				};
				transformed = await transformTsrxModuleWithPrerenderWakeClosure(
					linkedTransformInput,
					linkedChildHasBrowserTriggers,
				);
			}
			prerenderWakeCapabilities.set(
				source,
				manifestHasBrowserTriggers(transformed.manifest) || linkedChildHasBrowserTriggers,
			);
			if (
				publishesClientClaims &&
				!isClientPrimarySourceRequest(id) &&
				internalOptions.prerenderWakeChannel === true &&
				typeof this.getModuleInfo === 'function'
			) {
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
				const aggregateChildren = await resolveImportedChildren.call(
					this,
					source,
					aggregate.manifest,
				);
				await forceImportedModules.call(
					this,
					aggregateChildren,
					moduleLinkArtifacts,
					moduleMetadata,
					internalOptions,
					currentEnvironment,
				);
				let aggregateSymbols = importedSymbolInputs(aggregateChildren, moduleMetadata);
				for (
					let attempt = 0;
					importedClaimsMissing(aggregateChildren, aggregateSymbols, moduleMetadata);
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
					aggregateSymbols = importedSymbolInputs(aggregateChildren, moduleMetadata);
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
				registerTransformArtifacts({
					owner: cacheKey,
					source,
					manifestSource,
					result: transformed,
					virtualModules,
					moduleMetadata,
					moduleLinkArtifacts,
					transformVirtualModules,
					virtualModuleOwners,
					executionLogEstimatedSizes,
					executionLogEmittedIds,
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
				importedInterfaceHashes: importedInterfaceHashSignature(
					resolvedInterfaceImports,
					moduleLinkArtifacts,
				),
				importedSymbolClaims: importedSymbolClaimSignature(
					uniqueImportedModules([...resolvedInterfaceImports, ...resolvedChildren]),
					moduleMetadata,
				),
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
					registerRenderDataStyles({
						owner: cacheKey,
						source,
						modules: styleModules,
						virtualModules,
						transformVirtualModules,
						virtualModuleOwners,
						dev,
					});
					return {
						code: [
							...styleModules.map((module) => `import ${JSON.stringify(module.id)};`),
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
				for (const child of importedChildren.values()) {
					validateImportedChild(child, moduleMetadata);
				}
				if (getEnvironment(this) !== 'client') return;
				await finalizeBundle(this, bundle, {
					options: internalOptions,
					moduleMetadata,
					root: getRoot(),
					executionLogEmittedIds,
					executionAttributionTables: (manifests) =>
						executionAttributionTables(
							manifests,
							getRoot(),
							importedChildren.values(),
						),
				});
			},
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	function registerClientRouteArtifactSource(source: string) {
		if (clientRouteArtifactSources.has(source)) return;
		if (transformedClientPrimarySources.has(source)) {
			if (internalOptions.dev !== true) {
				throw new Error(
					`MARKLESS_ROUTE_ARTIFACT_REGISTERED_LATE: Client route artifact ${JSON.stringify(source)} was registered after its primary module transformed. Register every production route artifact before transformation begins.`,
				);
			}
			invalidateAllGeneratedModules(source, 'client');
			transformedClientPrimarySources.delete(source);
			internalOptions.devServer?.invalidateModule?.(source, 'client');
		}
		clientRouteArtifactSources.add(source);
	}

	return plugin;
}

async function materializeArtifactChildren(
	this: {
		resolve(
			source: string,
			importer?: string,
			options?: { readonly skipSelf?: boolean },
		): Promise<{ readonly id: string } | string | null>;
	},
	parent: string,
	appRoot: string | undefined,
	candidates: ReadonlyArray<ArtifactChildCandidate>,
): Promise<NonNullable<TransformTsrxModuleInput['artifactChildMaterializations']>> {
	const materialized: Record<
		string,
		NonNullable<TransformTsrxModuleInput['artifactChildMaterializations']>[string]
	> = {};
	const loaded = new Map<string, Record<string, unknown>>();
	for (const candidate of candidates) {
		if (TSRX_SOURCE_FILE.test(candidate.importSource)) continue;
		const resolved = await this.resolve(candidate.importSource, parent, { skipSelf: true });
		const id = typeof resolved === 'string' ? resolved : resolved?.id;
		if (!id) continue;
		const source = pathname(id);
		if (
			!appRoot ||
			!isAbsolute(source) ||
			!existsSync(source) ||
			!statSync(source).isFile() ||
			isInsideRoot(source, appRoot)
		)
			continue;
		let module = loaded.get(source);
		if (!module) {
			module = (await import(pathToFileURL(source).href)) as Record<string, unknown>;
			loaded.set(source, module);
		}
		const component =
			candidate.importKind === 'default'
				? module.default
				: candidate.importKind === 'namespace'
					? module
					: module[candidate.importedName ?? candidate.componentName];
		const renderSsr = (component as { readonly renderSsr?: unknown } | undefined)?.renderSsr;
		if (typeof renderSsr !== 'function') continue;
		const underivable = candidate.props.find((prop) => prop.kind !== 'serializable');
		if (underivable || (candidate.hasChildren && !candidate.projection)) {
			const prop = underivable?.name ?? 'children';
			throw new Error(
				`MARKLESS_ARTIFACT_CHILD_PROP_NOT_BUILD_KNOWN: <${candidate.componentName}> prop ${JSON.stringify(prop)} must be a build-known static value. Runtime component execution is not a fallback.`,
			);
		}
		const props = Object.fromEntries(
			candidate.props.map((prop) => [prop.name, prop.value]),
		) as Record<string, unknown>;
		if (candidate.projection) props.children = candidate.projection.markup;
		const output = await renderSsr.call(component, props);
		if (
			!output ||
			typeof output !== 'object' ||
			typeof (output as { readonly html?: unknown }).html !== 'string'
		) {
			throw new Error(
				`MARKLESS_ARTIFACT_CHILD_RENDER_INVALID: <${candidate.componentName}> renderSsr must return static HTML.`,
			);
		}
		const result = output as Record<string, unknown>;
		materialized[candidate.edgeId] = {
			html: result.html as string,
			elementCount: typeof result.elementCount === 'number' ? result.elementCount : 0,
			...(result.state ? { state: result.state as never } : {}),
			...(result.view ? { view: result.view as never } : {}),
			...(result.coordinates ? { coordinates: result.coordinates as never } : {}),
			...(result.structure ? { structure: result.structure as never } : {}),
			...(Array.isArray(result.structureTokens)
				? { structureTokens: result.structureTokens as never }
				: {}),
		};
	}
	return materialized;
}

function isInsideRoot(source: string, root: string): boolean {
	const path = relative(root, source);
	return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../'));
}

function isModuleEntry(
	context: {
		getModuleInfo?(id: string): { readonly isEntry?: boolean } | null;
	},
	id: string,
): boolean {
	try {
		return context.getModuleInfo?.(id)?.isEntry === true;
	} catch {
		// Unknown entry posture cannot authorize page-root materialization.
		return false;
	}
}

async function resolveImportedChildren(
	this: {
		resolve(
			source: string,
			importer?: string,
			options?: { readonly skipSelf?: boolean },
		): Promise<{ readonly id: string } | null>;
	},
	parent: string,
	manifest: MarklessTransformManifest,
): Promise<ImportedChild[]> {
	return await Promise.all(
		(manifest.symbolRoutes ?? []).map(async (route) => {
			const resolvedImport = await this.resolve(route.importSource, parent, {
				skipSelf: true,
			});
			const resolvedId =
				typeof resolvedImport === 'string'
					? resolvedImport
					: resolvedImport && typeof resolvedImport === 'object' && 'id' in resolvedImport
						? String(resolvedImport.id)
						: fallbackImportedSource(parent, route.importSource);
			return {
				parent,
				specifier: route.importSource,
				source: pathname(resolvedId),
				componentEdgeId: route.componentEdgeId,
			};
		}),
	);
}

async function resolveImportedModuleInterfaces(
	this: {
		resolve(
			source: string,
			importer?: string,
			options?: { readonly skipSelf?: boolean },
		): Promise<{ readonly id: string } | string | null>;
	},
	parent: string,
	moduleImports: MarklessModuleLinkArtifact['moduleImports'],
): Promise<ImportedChild[]> {
	return await Promise.all(
		moduleImports
			.filter((moduleImport) => TSRX_SOURCE_FILE.test(moduleImport.source))
			.map(async (moduleImport) => {
				const resolvedImport = await this.resolve(moduleImport.source, parent, {
					skipSelf: true,
				});
				const resolvedId =
					typeof resolvedImport === 'string'
						? resolvedImport
						: resolvedImport && 'id' in resolvedImport
							? String(resolvedImport.id)
							: fallbackImportedSource(parent, moduleImport.source);
				return {
					parent,
					specifier: moduleImport.source,
					source: pathname(resolvedId),
				};
			}),
	);
}

async function forceImportedModules(
	this: {
		load?: (input: { readonly id: string }) => Promise<unknown> | unknown;
		getModuleInfo?: (id: string) => unknown;
	},
	imports: ReadonlyArray<ImportedChild>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	metadata: ModuleMetadataRegistry,
	options: Pick<InternalMarklessRolldownOptions, 'dev' | 'devServer' | 'prerenderWakeChannel'>,
	environment: MarklessEnvironment,
) {
	for (const imported of imports) {
		if (!artifacts.has(imported.source)) {
			if (options.dev === true) {
				await options.devServer?.transformRequest(imported.source, environment);
			} else if (typeof this.load === 'function') {
				await this.load({ id: imported.source });
			}
		}
		// Materialize symbols before linking captures from a data-only facade.
		const captureMetadata = metadata.captureMetadataForSource(imported.source);
		if (environment !== 'client') {
			continue;
		}
		if (!captureMetadata?.extractedSymbols.length) {
			await metadata.sealSourceSymbolClaims(imported.source);
			continue;
		}
		const wakeSource = withQuery(imported.source, { 'markless-prerender-wake': null });
		const completeWakeVariants = options.prerenderWakeChannel === true;
		const claimSources = [
			...(completeWakeVariants ? [imported.source] : []),
			...(completeWakeVariants
				? [withQuery(imported.source, { 'markless-resume': null })]
				: []),
			...(completeWakeVariants ? [wakeSource] : []),
			withQuery(imported.source, { 'markless-symbols': null }),
		];
		if (typeof this.getModuleInfo === 'function') {
			metadata.expectSourceSymbolClaims(imported.source, claimSources);
		}
		if (options.dev === true) {
			await Promise.all(
				claimSources.map((source) =>
					options.devServer?.transformRequest(source, environment),
				),
			);
		} else if (typeof this.load === 'function') {
			await Promise.all(claimSources.map((id) => this.load?.({ id })));
		}
		await metadata.sealSourceSymbolClaims(imported.source);
	}
}

function importedModuleInterfaces(
	imports: ReadonlyArray<ImportedChild>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
): NonNullable<import('./types.ts').TransformTsrxModuleInput['importedModuleInterfaces']> {
	return Object.fromEntries(
		imports.flatMap((imported) => {
			const artifact = artifacts.get(imported.source);
			return artifact ? [[imported.specifier, artifact.moduleGraphInterface] as const] : [];
		}),
	);
}

function uniqueImportedModules(imports: ReadonlyArray<ImportedChild>): ImportedChild[] {
	return [
		...new Map(
			imports.map((imported) => [
				`${imported.parent}\0${imported.specifier}\0${imported.source}`,
				imported,
			]),
		).values(),
	];
}

function importedSymbolInputs(
	children: ReadonlyArray<ImportedChild>,
	metadata: ModuleMetadataRegistry,
): NonNullable<TransformTsrxModuleInput['symbols']> {
	return children.flatMap((child) => {
		const captureMetadata = metadata.captureMetadataForSource(child.source);
		const claimManifest = sourceSymbolManifest(metadata, child.source);
		if (!captureMetadata || !claimManifest || !child.componentEdgeId) return [];
		return claimManifest.symbols.flatMap((symbol) => {
			const captureSymbol = captureMetadata.extractedSymbols.find(
				(candidate) => candidate.symbolId === symbol.symbolId,
			);
			return captureSymbol?.captureSlots.some((slot) => slot.propName !== undefined)
				? [
						{
							id: `imported:${encodeURIComponent(child.source)}:${symbol.symbolId}`,
							chunk: symbol.virtualModuleId,
							exportName: symbol.exportName,
							componentEdgeId: child.componentEdgeId,
							captureSymbol,
						},
					]
				: [];
		});
	});
}

function importedClaimsMissing(
	children: ReadonlyArray<ImportedChild>,
	symbols: NonNullable<TransformTsrxModuleInput['symbols']>,
	metadata: ModuleMetadataRegistry,
): boolean {
	return children.some((child) => {
		const expectsClaims = metadata
			.captureMetadataForSource(child.source)
			?.extractedSymbols.some((symbol) =>
				symbol.captureSlots.some((slot) => slot.propName !== undefined),
			);
		return (
			expectsClaims === true &&
			!symbols.some((symbol) => symbol.componentEdgeId === child.componentEdgeId)
		);
	});
}

function linkedChildrenHaveBrowserTriggers(
	children: ReadonlyArray<ImportedChild>,
	metadata: ModuleMetadataRegistry,
	capabilities: ReadonlyMap<string, boolean>,
): boolean {
	return children.some((child) => {
		const manifest = sourceSymbolManifest(metadata, child.source);
		return (
			(manifest !== undefined && manifestHasBrowserTriggers(manifest)) ||
			capabilities.get(child.source) === true
		);
	});
}

function sourceSymbolManifest(
	metadata: ModuleMetadataRegistry,
	source: string,
): MarklessTransformManifest | undefined {
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodeURIComponent(source)}`;
	return metadata.sourceSymbolClaims(source, resolverId);
}

function manifestHasBrowserTriggers(manifest: MarklessTransformManifest): boolean {
	return manifest.symbols.some(
		(symbol) => symbol.kind === 'event-handler' || symbol.kind === 'behavior',
	);
}

function fallbackImportedSource(parent: string, specifier: string): string {
	const source = specifier.split('?')[0]!;
	return isRelativeImport(source) ? resolve(dirname(parent), source) : source;
}

function importedChildKey(child: ImportedChild): string {
	return `${child.parent}\0${child.specifier}\0${child.source}`;
}

function validateImportedChild(
	child: ImportedChild,
	metadata: ModuleMetadataRegistry,
	parentManifest?: Pick<MarklessTransformManifest, 'captureMetadata'>,
) {
	// A parent mid-transform is not in the registry yet; validate against the pass it is minting.
	const parentMetadata =
		parentManifest?.captureMetadata ?? metadata.captureMetadataForSource(pathname(child.parent));
	const childMetadata = metadata.captureMetadataForSource(child.source);
	// Plain TypeScript source components (for example @markless/router's Html)
	// are author-time helpers, not compiled TSRX artifacts. A built JavaScript
	// component remains subject to the fail-closed metadata check below.
	if (!childMetadata && isPlainTypeScriptSource(child.source)) return;
	if (
		parentMetadata &&
		childMetadata?.passId === parentMetadata.passId &&
		Array.isArray(childMetadata.extractedSymbols) &&
		Array.isArray(childMetadata.diagnostics)
	) {
		return;
	}
	throw new Error(
		`MARKLESS_CAPTURE_METADATA_MISSING: Parent module ${JSON.stringify(child.parent)} composes imported child ${JSON.stringify(child.specifier)}, but its compiled artifact has no current capture metadata. Rebuild the child with the current Markless compiler and clear any stale build cache.`,
	);
}

function isPlainTypeScriptSource(source: string): boolean {
	return /\.[cm]?tsx?$/.test(source);
}

type ExecutionAttributionNode = {
	readonly source: string;
	readonly symbolRoutes: ReadonlyArray<{ readonly prefix: string; readonly importSource: string }>;
};

// The consumer looks these tables up by the bare path the document names (the
// route file, or the single root of a routeless build). A transform variant's
// query — `?markless-symbols`, `?markless-resume`, `?markless-prerender-wake` —
// is a build-side name for the same source file, so the variants of one source
// merge into one node. Without this, a component reached as a child under its
// bare path and as a root under its queried path is both, and no key the
// consumer can produce ever matches.
function canonicalExecutionAttributionSource(source: string): string {
	return source.split('?')[0]!.split('#')[0]!;
}

function canonicalExecutionAttributionNodes(
	manifests: Iterable<MarklessTransformManifest>,
): ReadonlyMap<string, ExecutionAttributionNode> {
	const routesBySource = new Map<string, Map<string, string>>();
	// Sorted so a prefix claimed by two variants resolves the same way on every
	// build; the emitted map is a permanent artifact, not a per-run reading.
	const sorted = [...manifests].sort((left, right) => left.source.localeCompare(right.source));
	for (const manifest of sorted) {
		const source = canonicalExecutionAttributionSource(manifest.source);
		const routes = routesBySource.get(source) ?? new Map<string, string>();
		for (const route of manifest.symbolRoutes ?? [])
			if (!routes.has(route.prefix)) routes.set(route.prefix, route.importSource);
		routesBySource.set(source, routes);
	}
	return new Map(
		[...routesBySource].map(([source, routes]) => [
			source,
			{
				source,
				symbolRoutes: [...routes].map(([prefix, importSource]) => ({ prefix, importSource })),
			},
		]),
	);
}

function executionAttributionRoots(
	nodes: ReadonlyMap<string, ExecutionAttributionNode>,
	childrenByRoute: ReadonlyMap<string, string>,
): string[] {
	const children = new Set<string>();
	for (const node of nodes.values()) {
		for (const route of node.symbolRoutes) {
			const child = resolvedRouteSource(node.source, route.importSource, childrenByRoute);
			if (nodes.has(child)) children.add(child);
		}
	}
	return [...nodes.keys()].filter((source) => !children.has(source));
}

function executionAttributionTables(
	manifests: Iterable<MarklessTransformManifest>,
	root: string | undefined,
	children: Iterable<ImportedChild>,
): Record<string, Record<string, string>> {
	const nodes = canonicalExecutionAttributionNodes(manifests);
	const childrenByRoute = new Map(
		[...children]
			.map(
				(child) =>
					[
						routeKey(
							canonicalExecutionAttributionSource(child.parent),
							child.specifier,
						),
						canonicalExecutionAttributionSource(child.source),
					] as const,
			)
			.sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1])),
	);
	return Object.fromEntries(
		executionAttributionRoots(nodes, childrenByRoute)
			.sort()
			.map((source) => [
				executionAttributionRouteKey(source, root),
				flattenExecutionAttributionScopes(source, nodes, childrenByRoute),
			]),
	);
}

function executionAttributionRouteKey(source: string, root: string | undefined): string {
	const prefix = root ? `${root.replace(/[/\\]+$/, '')}/` : '';
	return (prefix && source.startsWith(prefix) ? source.slice(prefix.length) : source).replace(
		/^[/\\]+/,
		'',
	);
}

function flattenExecutionAttributionScopes(
	root: string,
	nodes: ReadonlyMap<string, ExecutionAttributionNode>,
	childrenByRoute: ReadonlyMap<string, string>,
): Record<string, string> {
	const scopes: Record<string, string> = {};
	const visit = (source: string, scope: string, seen: ReadonlySet<string>) => {
		if (seen.has(source)) return;
		scopes[scope] = encodedSymbolSource(source);
		const manifest = nodes.get(source);
		for (const route of manifest?.symbolRoutes ?? []) {
			const child = resolvedRouteSource(source, route.importSource, childrenByRoute);
			if (!nodes.has(child)) continue;
			visit(child, scope + route.prefix, new Set([...seen, source]));
		}
	};
	visit(root, '', new Set());
	return scopes;
}

function resolvedRouteSource(
	parent: string,
	specifier: string,
	childrenByRoute: ReadonlyMap<string, string>,
): string {
	return (
		childrenByRoute.get(routeKey(parent, specifier)) ??
		fallbackImportedSource(parent, specifier)
	);
}

function routeKey(parent: string, specifier: string): string {
	return `${parent}\0${specifier}`;
}

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'markless:rolldown';
	}

	return `markless:rolldown:${environment}`;
}

function registerTransformArtifacts(input: {
	owner: string;
	source: string;
	manifestSource: string;
	result: TransformTsrxModuleResult;
	virtualModules: Map<string, MarklessVirtualModule>;
	moduleMetadata: ModuleMetadataRegistry;
	moduleLinkArtifacts: Map<string, MarklessModuleLinkArtifact>;
	transformVirtualModules: Map<string, Set<string>>;
	virtualModuleOwners: Map<string, Set<string>>;
	executionLogEstimatedSizes: Map<string, number>;
	executionLogEmittedIds: Map<string, string>;
	dev: ReturnType<typeof createMarklessDevGraph>;
	environment: MarklessEnvironment;
	finalPublication?: boolean;
	tracksSourceClaimPublication?: boolean;
	replaceOwnedArtifacts?: boolean;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
}) {
	const ids = new Set<string>();
	const renderDataHashes = new Map<string, string>();
	for (const module of input.result.virtualModules) {
		if (input.finalPublication === false && module.type === 'resolver') continue;
		const isClientSymbol = input.environment === 'client' && module.type === 'symbol';
		// The symbol virtual module id embeds the source filename, so it is the
		// collision-free execution-log id: re-key the injected hook (dev builds)
		// and the size estimate to that same id so the join always resolves.
		const stored = isClientSymbol
			? { ...module, source: requalifyExecutionLogModuleHook(module.source, module.id) }
			: module;
		const current = input.virtualModules.get(module.id);
		if (module.type === 'resolver' && current?.type === 'resolver') {
			const currentClaims = new Set(current.symbolClaims ?? []);
			const nextClaims = new Set(module.symbolClaims ?? []);
			const currentContainsNext = [...nextClaims].every((claim) => currentClaims.has(claim));
			const nextContainsCurrent = [...currentClaims].every((claim) => nextClaims.has(claim));
			if (currentContainsNext && !nextContainsCurrent) continue;
			if (!currentContainsNext && !nextContainsCurrent) {
				throw new Error(
					`MARKLESS_RESOLVER_CLAIMS_DIVERGED: Resolver ${JSON.stringify(module.id)} has incompatible final claim sets.`,
				);
			}
		}
		// Parallel sibling transforms share this id: canonical render data must not be replaced.
		if (
			module.type !== 'render-data' ||
			current?.type !== 'render-data' ||
			current.canonicalRenderData !== true ||
			module.canonicalRenderData === true
		) {
			input.virtualModules.set(module.id, stored);
		}
		ids.add(module.id);
		const owners = input.virtualModuleOwners.get(module.id) ?? new Set<string>();
		owners.add(input.owner);
		input.virtualModuleOwners.set(module.id, owners);
		if (module.type === 'render-data') {
			renderDataHashes.set(resolveVirtualId(module.id), renderDataHash(module.source));
		}
		if (isClientSymbol) {
			input.executionLogEstimatedSizes.set(module.id, stored.source.length);
			if (hasExecutionLogModuleHook(stored.source))
				input.executionLogEmittedIds.set(module.id, module.id);
		}
	}
	input.moduleMetadata.recordCaptureMetadata(input.source, input.result.manifest);
	if (input.finalPublication !== false) {
		const symbolClaim = emittedSymbolClaim(
			input.moduleMetadata,
			input.source,
			input.manifestSource,
			input.result.manifest,
			input.result.virtualModules,
		);
		input.moduleMetadata.recordSymbolClaims(symbolClaim.owner, symbolClaim.manifest);
		if (input.tracksSourceClaimPublication === true) {
			input.moduleMetadata.finishSourceSymbolClaims(input.source, input.manifestSource);
		}
	}
	input.moduleLinkArtifacts.set(input.source, {
		moduleGraphInterface: input.result.moduleGraphInterface,
		interfaceHash: input.result.interfaceHash,
		moduleImports: input.result.moduleImports,
	});
	const previouslyOwned = input.transformVirtualModules.get(input.owner) ?? new Set<string>();
	if (input.replaceOwnedArtifacts === true) {
		for (const staleId of previouslyOwned) {
			if (ids.has(staleId)) continue;
			const owners = input.virtualModuleOwners.get(staleId);
			owners?.delete(input.owner);
			if (!owners || owners.size === 0) {
				input.virtualModuleOwners.delete(staleId);
				input.virtualModules.delete(staleId);
			}
		}
		input.transformVirtualModules.set(input.owner, ids);
	} else {
		input.transformVirtualModules.set(input.owner, new Set([...previouslyOwned, ...ids]));
	}
	input.dev.record(input.source, ids, input.environment);
	if (renderDataHashes.size > 0) input.updateDevPrerenderHashes?.(renderDataHashes);
}

function replaceClaimsWithPrerenderWakeOwner(
	metadata: ModuleMetadataRegistry,
	source: string,
): void {
	for (const emittedModule of metadata.symbolClaimMap().keys()) {
		if (
			pathname(emittedModule) === source &&
			(emittedModule === source || isResumeSourceRequest(emittedModule))
		) {
			metadata.deleteSymbolClaims(emittedModule);
		}
	}
}

function emittedSymbolClaim(
	metadata: ModuleMetadataRegistry,
	source: string,
	emittedModule: string,
	manifest: MarklessTransformManifest,
	virtualModules: ReadonlyArray<MarklessVirtualModule>,
): { readonly owner: string; readonly manifest: MarklessTransformManifest } {
	const claim = manifestForSource(manifest, emittedModule);
	if (isPrerenderWakeSourceRequest(emittedModule) && manifest.symbols.length > 0) {
		// The generated resolver owns wake-wrapper symbol routes when it survives
		// the final strip; final claim selection drops this owner if it does not.
		replaceClaimsWithPrerenderWakeOwner(metadata, source);
		const resolver = virtualModules.find((module) => module.type === 'resolver');
		if (!resolver) throw new Error('MARKLESS_PRERENDER_WAKE_RESOLVER_MISSING');
		return {
			owner: resolver.id,
			manifest: {
				...manifestForSource(manifest, source),
				resolver: { virtualModuleId: resolver.id },
			},
		};
	}
	// An ineligible wake request emits no facade and therefore cannot displace
	// the ordinary source or symbols sibling that still owns these claims.
	const wakeOwnsRoutes = metadata.hasSymbolClaims(manifest.resolver.virtualModuleId);
	return {
		owner: emittedModule,
		manifest:
			wakeOwnsRoutes && (emittedModule === source || isResumeSourceRequest(emittedModule))
				? { ...claim, symbols: [] }
				: claim,
	};
}

function registerRenderDataStyles(input: {
	owner: string;
	source: string;
	modules: ReadonlyArray<MarklessVirtualModule>;
	virtualModules: Map<string, MarklessVirtualModule>;
	transformVirtualModules: Map<string, Set<string>>;
	virtualModuleOwners: Map<string, Set<string>>;
	dev: ReturnType<typeof createMarklessDevGraph>;
}) {
	if (input.modules.length === 0) return;
	const ids = new Set(input.transformVirtualModules.get(input.owner) ?? []);
	for (const module of input.modules) {
		input.virtualModules.set(module.id, module);
		ids.add(module.id);
		const owners = input.virtualModuleOwners.get(module.id) ?? new Set<string>();
		owners.add(input.owner);
		input.virtualModuleOwners.set(module.id, owners);
	}
	input.transformVirtualModules.set(input.owner, ids);
	input.dev.record(
		input.source,
		input.modules.map((module) => module.id),
		'client',
	);
}

function manifestForSource(
	manifest: MarklessTransformManifest,
	source: string,
): MarklessTransformManifest {
	return manifest.source === source ? manifest : { ...manifest, source };
}

function renderDataClaimManifest(
	manifest: MarklessTransformManifest,
	source: string,
): MarklessTransformManifest {
	// Data-only facades keep demand records but own no symbol claims.
	return { ...manifestForSource(manifest, source), symbols: [] };
}

function renderDataHash(source: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < source.length; index += 1) {
		hash ^= source.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return `mrd1-${(hash >>> 0).toString(36)}`;
}

function importedInterfaceHashSignature(
	imports: ReadonlyArray<ImportedChild>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
): string {
	return imports
		.map((imported) =>
			[
				imported.specifier,
				imported.source,
				artifacts.get(imported.source)?.interfaceHash ?? 'missing',
			]
				.map(encodeURIComponent)
				.join(':'),
		)
		.sort()
		.join('|');
}

function importedSymbolClaimSignature(
	imports: ReadonlyArray<ImportedChild>,
	metadata: ModuleMetadataRegistry,
): string {
	return [...new Set(imports.map((imported) => imported.source))]
		.sort()
		.map((source) =>
			JSON.stringify([source, sourceSymbolManifest(metadata, source)?.symbols ?? []]),
		)
		.join('|');
}

function isRenderDataOnlyTransformChange(
	previous: TransformTsrxModuleResult,
	next: TransformTsrxModuleResult,
): boolean {
	if (previous.interfaceHash !== next.interfaceHash || previous.code !== next.code) return false;
	if (JSON.stringify(previous.moduleImports) !== JSON.stringify(next.moduleImports)) return false;
	const withoutRenderData = (result: TransformTsrxModuleResult) =>
		result.virtualModules.filter((module) => module.type !== 'render-data');
	if (JSON.stringify(withoutRenderData(previous)) !== JSON.stringify(withoutRenderData(next))) {
		return false;
	}
	return JSON.stringify(previous.manifest) === JSON.stringify(next.manifest);
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
