import type { InputOptions, Plugin } from 'rolldown';
import { dirname, isAbsolute, resolve } from 'pathe';
import { joinURL, parsePath, withQuery, withoutLeadingSlash } from 'ufo';
import { type MarklessBuildMetadataBundle, createBuildMetadata } from './build/build-metadata.ts';
import { injectCsrNativeMarkup } from './build/csr-native-markup.ts';
import { MARKLESS_BUILD_PREFIX, MARKLESS_BUNDLE_GRAPH, outputDefaults } from './build/chunking.ts';
import { MARKLESS_EXECUTION_SIZES, createExecutionSizesAsset } from './build/execution-sizes.ts';
import { collectModulePreloadInjections, injectHeadLinks } from './build/head-links.ts';
import { stripEmptyVitePreloadWrappers } from './build/preload-cleanup.ts';
import {
	compactGeneratedDirectSymbolLoaders,
	rewriteGeneratedSymbolFacadeImports,
	rewriteGeneratedSymbolInitExports,
} from './build/symbol-facade-cleanup.ts';
import {
	rewriteGeneratedSymbolTableUrls,
	verifyGeneratedSymbolTableRoutes,
} from './build/symbol-table.ts';
import { createMarklessDevGraph } from './dev.ts';
import {
	MARKLESS_EXECUTION_LOG_MODULE_ID,
	executionLogActivationInjection,
	executionLogVirtualModuleSource,
	injectExecutionLogModuleHook,
	normalizeExecutionLogMode,
	requalifyExecutionLogModuleHook,
} from './execution-log.ts';
import { encodedSymbolSource, symbolVirtualModuleSourceFile } from './source-module.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	compileTsrxModuleLinkArtifact,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
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
	publicPath?: (fileName: string) => string;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
};

const TSRX_SOURCE_FILE = /\.tsrx(?:[?#].*)?$/;
const MARKLESS_SYMBOL_SOURCE_QUERY_RE = /[?&]markless-symbols(?:[&#]|$)/;
const MARKLESS_RESUME_SOURCE_QUERY_RE = /[?&]markless-resume(?:[&#]|$)/;
const RESUME_VIRTUAL_ID_RE = /^virtual:markless:resume:([^:]+)$/;
const SYMBOL_VIRTUAL_STRING_RE = /(["'`])((?:virtual:markless:symbol:)[^"'`]+)\1/g;

export const marklessClient = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'client', options });
export const marklessServer = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'server', options });
export const marklessLib = (options: MarklessRolldownOptions = {}) =>
	createMarklessRolldownPlugin({ environment: 'lib', options });

export function createMarklessRolldownPlugin(input: {
	environment: Environment;
	options?: MarklessRolldownOptions;
}): MarklessRolldownPlugin {
	const environment = input.environment;
	const internalOptions = (input.options ?? {}) as InternalMarklessRolldownOptions;
	const virtualModules = new Map<string, MarklessVirtualModule>();
	const transformManifests = new Map<string, MarklessTransformManifest>();
	const moduleLinkArtifacts = new Map<string, MarklessModuleLinkArtifact>();
	const linkedTransformCache = new Map<
		string,
		{
			readonly source: string;
			readonly code: string;
			readonly importedInterfaceHashes: string;
			readonly input: TransformTsrxModuleInput;
			readonly result: TransformTsrxModuleResult;
		}
	>();
	const importedChildren = new Map<string, ImportedChild>();
	const importedChildSources = new Set<string>();
	const emittedClientResolverSources = new Set<string>();
	const sourceVirtualModules = new Map<string, Set<string>>();
	const clientSymbolEntrySources = new Set<string>();
	const executionLogEstimatedSizes = new Map<string, number>();
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
		transformManifests.delete(changedSource);
		for (const [key, cached] of linkedTransformCache) {
			if (cached.source === changedSource) linkedTransformCache.delete(key);
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
				return [key, cached, nextInput, await transformTsrxModule(nextInput)] as const;
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
			transformManifests.set(changedSource, next.manifest);
			for (const module of next.virtualModules) {
				if (module.type !== 'render-data') continue;
				virtualModules.set(module.id, module);
				renderDataIds.add(resolveVirtualId(module.id));
			}
		}
		return [...renderDataIds];
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
			clientSymbolEntrySources.clear();
			virtualModules.clear();
			transformManifests.clear();
			moduleLinkArtifacts.clear();
			linkedTransformCache.clear();
			importedChildren.clear();
			importedChildSources.clear();
			emittedClientResolverSources.clear();
			sourceVirtualModules.clear();
			executionLogEstimatedSizes.clear();
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
			const virtualModule = virtualModules.get(normalized);
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

			const symbolSource = sourceForSymbolVirtualImporter(importer);
			if (symbolSource && isRelativeImport(source)) {
				return await this.resolve(source, symbolSource, { skipSelf: true });
			}
			const resumeSource = sourceForResumeVirtualImporter(importer);
			if (resumeSource && isRelativeImport(source)) {
				return await this.resolve(source, resumeSource, { skipSelf: true });
			}

			return null;
		},
		load(id) {
			if (normalizeVirtualId(id) === MARKLESS_EXECUTION_LOG_MODULE_ID) {
				const embedsDevSizes =
					internalOptions.dev === true && getEnvironment(this) === 'client';
				return executionLogVirtualModuleSource({
					moduleSizes: embedsDevSizes ? executionLogEstimatedSizes : undefined,
					attribution: embedsDevSizes
						? executionAttributionTables(
								transformManifests,
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
			const module = virtualModules.get(normalizeVirtualId(id));
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
				if (
					currentEnvironment === 'client' &&
					internalOptions.dev === true &&
					normalizeExecutionLogMode(internalOptions.executionLog) !== 'never' &&
					isMarklessRuntimeModule(id)
				) {
					executionLogEstimatedSizes.set(executionLogRuntimeModuleId(id), code.length);
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
			clearSourceVirtualModules(source, virtualModules, sourceVirtualModules);
			const transformInput: TransformTsrxModuleInput = {
				filename: source,
				source: code,
				dev: internalOptions.dev === true,
				buildId: internalOptions.buildId,
				executionLog: normalizeExecutionLogMode(internalOptions.executionLog),
				executionLogModuleHooks:
					internalOptions.dev === true && currentEnvironment === 'client',
				inlineResumerDebug: internalOptions.inlineResumerDebug === true,
				prerenderRecords:
					internalOptions.prerender === true && currentEnvironment === 'client',
				environment: currentEnvironment,
				clientOutput:
					currentEnvironment === 'client' &&
					((clientSymbolEntrySources.has(source) && internalOptions.prerender !== true) ||
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
			};
			// One source can be requested as a full environment entry, a symbols-only
			// interaction entry, or a dev resume entry. Their linked interfaces are the
			// same, but their emitted module shapes are deliberately different.
			const cacheKey = [
				currentEnvironment,
				source,
				transformInput.clientOutput ?? 'full',
				isResumeSourceRequest(id) ? 'resume' : 'source',
			].join('\0');
			const cached = linkedTransformCache.get(cacheKey);
			let transformed: TransformTsrxModuleResult;
			let linkedTransformInput = transformInput;
			let reusedLinkedTransform = false;
			if (cached?.code === code) {
				const cachedImports = await resolveImportedModuleInterfaces.call(
					this,
					source,
					cached.result.moduleImports,
				);
				await forceImportedModules.call(
					this,
					cachedImports,
					moduleLinkArtifacts,
					internalOptions,
					currentEnvironment,
				);
				if (
					cached.importedInterfaceHashes ===
					importedInterfaceHashSignature(cachedImports, moduleLinkArtifacts)
				) {
					transformed = cached.result;
					linkedTransformInput = cached.input;
					reusedLinkedTransform = true;
				}
			}
			if (!reusedLinkedTransform) {
				try {
					transformed = await transformTsrxModule(transformInput);
				} catch (error) {
					// Imported graph helpers can diagnose before their interface is linked.
					// Publish only this compiler-owned link artifact so cycles never wait.
					const provisional = await compileTsrxModuleLinkArtifact(transformInput);
					moduleLinkArtifacts.set(source, provisional);
					const provisionalImports = await resolveImportedModuleInterfaces.call(
						this,
						source,
						provisional.moduleImports,
					);
					if (provisionalImports.length === 0) throw error;
					await forceImportedModules.call(
						this,
						provisionalImports,
						moduleLinkArtifacts,
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
					transformed = await transformTsrxModule(linkedTransformInput);
				}
			}
			// Register the first-pass artifact before loading children so the existing
			// cross-module registry can validate both sides of the composition edge.
			registerTransformArtifacts({
				source,
				result: transformed,
				virtualModules,
				transformManifests,
				moduleLinkArtifacts,
				sourceVirtualModules,
				executionLogEstimatedSizes,
				dev,
				environment: currentEnvironment,
				updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
			});
			const resolvedInterfaceImports = await resolveImportedModuleInterfaces.call(
				this,
				source,
				transformed.moduleImports,
			);
			const resolvedChildren = await resolveImportedChildren.call(
				this,
				source,
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
				internalOptions,
				currentEnvironment,
			);
			for (const child of resolvedChildren) {
				if (internalOptions.dev === true) {
					validateImportedChild(child, transformManifests);
				}
			}
			if (
				!reusedLinkedTransform &&
				(resolvedChildren.length > 0 || resolvedInterfaceImports.length > 0)
			) {
				linkedTransformInput = {
					...transformInput,
					symbols: importedSymbolInputs(resolvedChildren, transformManifests),
					importedModuleInterfaces: importedModuleInterfaces(
						resolvedInterfaceImports,
						moduleLinkArtifacts,
					),
				};
				transformed = await transformTsrxModule(linkedTransformInput);
			}
			registerTransformArtifacts({
				source,
				result: transformed,
				virtualModules,
				transformManifests,
				moduleLinkArtifacts,
				sourceVirtualModules,
				executionLogEstimatedSizes,
				dev,
				environment: currentEnvironment,
				updateDevPrerenderHashes: internalOptions.updateDevPrerenderHashes,
			});
			linkedTransformCache.set(cacheKey, {
				source,
				code,
				importedInterfaceHashes: importedInterfaceHashSignature(
					resolvedInterfaceImports,
					moduleLinkArtifacts,
				),
				input: linkedTransformInput,
				result: transformed,
			});
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

			if (currentEnvironment === 'client' && !internalOptions.dev) {
				for (const module of transformed.virtualModules.filter((item) => {
					if (item.type === 'symbol') return true;
					if (item.type === 'resolver') {
						return (
							(importedChildSources.has(source) ||
								(transformed.manifest.captureMetadata?.boundResolverRows?.length ??
									0) > 0) &&
							!emittedClientResolverSources.has(source)
						);
					}
					return (
						item.type === 'resume' &&
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
					validateImportedChild(child, transformManifests);
				}
				if (getEnvironment(this) !== 'client') return;

				recordProductionResumeModuleUrls(
					bundle,
					internalOptions.productionResumeModuleUrls,
					internalOptions.publicPath,
				);
				if (!internalOptions.prerender) {
					injectCsrNativeMarkup(bundle, transformManifests.values());
				}

				stripEmptyPreloadWrappersFromChunks(bundle);
				const removedSymbolFacades = rewriteGeneratedSymbolFacadeImports(bundle);
				rewriteGeneratedSymbolInitExports(bundle);
				compactGeneratedDirectSymbolLoaders(bundle);
				const manifestBundle = bundleWithoutRemovedChunks(bundle, removedSymbolFacades);
				const tableRewrite = rewriteGeneratedSymbolTableUrls(manifestBundle);
				if (tableRewrite.unresolved.length > 0) {
					this.error(
						`Markless symbol resolver table contains unresolved generated symbol chunks: ${tableRewrite.unresolved.join(', ')}. markless debugging playbook: run pnpm doctor, or read agent/markless.md in the installed @markless/core package`,
					);
				}
				const tableIntegrity = verifyGeneratedSymbolTableRoutes(
					manifestBundle,
					transformManifests.values(),
				);
				if (tableIntegrity.errors.length > 0) {
					this.error(
						`Markless symbol resolver table integrity check failed:\n${tableIntegrity.errors
							.map(
								(error) =>
									`- ${error.symbolId} -> ${error.claimedChunk}: ${error.reason}`,
							)
							.join('\n')}`,
					);
				}

				const clientManifest = createBuildMetadata(
					manifestBundle,
					transformManifests.values(),
					getRoot(),
					{
						bundleGraphAsset: MARKLESS_BUNDLE_GRAPH,
						bundleGraphAdders: internalOptions.bundleGraphAdders,
						canonPath: stripBuildPrefix,
						publicPath: internalOptions.publicPath,
						injections: internalOptions.devInjections,
					},
				);

				const executionLogInjection = executionLogActivationInjection(
					internalOptions.executionLog,
				);
				if (executionLogInjection) injectHeadLinks(bundle, [executionLogInjection]);
				injectHeadLinks(
					bundle,
					collectModulePreloadInjections(clientManifest, {
						publicPath: internalOptions.publicPath,
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

				this.emitFile({
					type: 'asset',
					fileName: MARKLESS_BUNDLE_GRAPH,
					source: JSON.stringify(clientManifest.bundleGraph),
				});
				this.emitFile(
					await createExecutionSizesAsset(
						manifestBundle,
						clientManifest,
						stripBuildPrefix,
						executionLogInjection
							? executionAttributionTables(
									transformManifests,
									getRoot(),
									importedChildren.values(),
								)
							: undefined,
					),
				);
				// The demand map lives in payload-module exports (tree-shaken from built
				// pages by design); ship it as a build asset so witness boxes and tooling
				// can derive allowed execution sets against real builds.
				this.emitFile({
					type: 'asset',
					fileName: `${MARKLESS_BUILD_PREFIX}execution-demand.json`,
					source: JSON.stringify(
						Object.fromEntries(
							clientManifest.modules
								.filter((module) => module.runtimeDemandMap)
								.map((module) => [module.source, module.runtimeDemandMap]),
						),
					),
				});
			},
		},
	} satisfies Plugin & { api: MarklessRolldownPluginApi };

	return plugin;
}

type ImportedChild = {
	readonly parent: string;
	readonly specifier: string;
	readonly source: string;
	readonly componentEdgeId?: string;
};

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
	this: { load?: (input: { readonly id: string }) => Promise<unknown> | unknown },
	imports: ReadonlyArray<ImportedChild>,
	artifacts: ReadonlyMap<string, MarklessModuleLinkArtifact>,
	options: Pick<InternalMarklessRolldownOptions, 'dev' | 'devServer'>,
	environment: MarklessEnvironment,
) {
	for (const imported of imports) {
		if (artifacts.has(imported.source)) continue;
		if (options.dev === true) {
			await options.devServer?.transformRequest(imported.source, environment);
		} else if (typeof this.load === 'function') {
			await this.load({ id: imported.source });
		}
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
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
): NonNullable<TransformTsrxModuleInput['symbols']> {
	return children.flatMap((child) => {
		const manifest = manifests.get(child.source);
		if (!manifest?.captureMetadata || !child.componentEdgeId) return [];
		return manifest.symbols.flatMap((symbol) => {
			const captureSymbol = manifest.captureMetadata?.extractedSymbols.find(
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

function fallbackImportedSource(parent: string, specifier: string): string {
	const source = specifier.split('?')[0]!;
	return isRelativeImport(source) ? resolve(dirname(parent), source) : source;
}

function importedChildKey(child: ImportedChild): string {
	return `${child.parent}\0${child.specifier}\0${child.source}`;
}

function validateImportedChild(
	child: ImportedChild,
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
) {
	const parentMetadata = manifests.get(child.parent)?.captureMetadata;
	const childMetadata = manifests.get(child.source)?.captureMetadata;
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

function executionAttributionRoots(
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
	childrenByRoute: ReadonlyMap<string, string>,
): string[] {
	const children = new Set<string>();
	for (const manifest of manifests.values()) {
		for (const route of manifest.symbolRoutes ?? []) {
			const child = resolvedRouteSource(manifest.source, route.importSource, childrenByRoute);
			if (manifests.has(child)) children.add(child);
		}
	}
	return [...manifests.keys()].filter((source) => !children.has(source));
}

function executionAttributionTables(
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
	root: string | undefined,
	children: Iterable<ImportedChild>,
): Record<string, Record<string, string>> {
	const childrenByRoute = new Map(
		[...children].map((child) => [routeKey(child.parent, child.specifier), child.source]),
	);
	return Object.fromEntries(
		executionAttributionRoots(manifests, childrenByRoute)
			.sort()
			.map((source) => [
				executionAttributionRouteKey(source, root),
				flattenExecutionAttributionScopes(source, manifests, childrenByRoute),
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
	manifests: ReadonlyMap<string, MarklessTransformManifest>,
	childrenByRoute: ReadonlyMap<string, string>,
): Record<string, string> {
	const scopes: Record<string, string> = {};
	const visit = (source: string, scope: string, seen: ReadonlySet<string>) => {
		if (seen.has(source)) return;
		scopes[scope] = encodedSymbolSource(source);
		const manifest = manifests.get(source);
		for (const route of manifest?.symbolRoutes ?? []) {
			const child = resolvedRouteSource(source, route.importSource, childrenByRoute);
			if (!manifests.has(child)) continue;
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

function pluginName(environment: Environment) {
	if (typeof environment === 'function') {
		return 'markless:rolldown';
	}

	return `markless:rolldown:${environment}`;
}

function registerTransformArtifacts(input: {
	source: string;
	result: TransformTsrxModuleResult;
	virtualModules: Map<string, MarklessVirtualModule>;
	transformManifests: Map<string, MarklessTransformManifest>;
	moduleLinkArtifacts: Map<string, MarklessModuleLinkArtifact>;
	sourceVirtualModules: Map<string, Set<string>>;
	executionLogEstimatedSizes: Map<string, number>;
	dev: ReturnType<typeof createMarklessDevGraph>;
	environment: MarklessEnvironment;
	updateDevPrerenderHashes?: (hashes: ReadonlyMap<string, string>) => void;
}) {
	const ids = new Set<string>();
	const renderDataHashes = new Map<string, string>();
	for (const module of input.result.virtualModules) {
		const isClientSymbol = input.environment === 'client' && module.type === 'symbol';
		// The symbol virtual module id embeds the source filename, so it is the
		// collision-free execution-log id: re-key the injected hook (dev builds)
		// and the size estimate to that same id so the join always resolves.
		const stored = isClientSymbol
			? { ...module, source: requalifyExecutionLogModuleHook(module.source, module.id) }
			: module;
		input.virtualModules.set(module.id, stored);
		ids.add(module.id);
		if (module.type === 'render-data') {
			renderDataHashes.set(resolveVirtualId(module.id), renderDataHash(module.source));
		}
		if (isClientSymbol) {
			input.executionLogEstimatedSizes.set(module.id, stored.source.length);
		}
	}
	input.transformManifests.set(input.source, input.result.manifest);
	input.moduleLinkArtifacts.set(input.source, {
		moduleGraphInterface: input.result.moduleGraphInterface,
		interfaceHash: input.result.interfaceHash,
		moduleImports: input.result.moduleImports,
	});
	input.sourceVirtualModules.set(input.source, ids);
	input.dev.record(input.source, ids, input.environment);
	if (renderDataHashes.size > 0) input.updateDevPrerenderHashes?.(renderDataHashes);
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
	const withoutNativeMarkup = (manifest: MarklessTransformManifest) => {
		const { csrNativeMarkup: _csrNativeMarkup, ...stable } = manifest;
		return stable;
	};
	return (
		JSON.stringify(withoutNativeMarkup(previous.manifest)) ===
		JSON.stringify(withoutNativeMarkup(next.manifest))
	);
}

function clearSourceVirtualModules(
	source: string,
	virtualModules: Map<string, MarklessVirtualModule>,
	sourceVirtualModules: Map<string, Set<string>>,
) {
	const stale = sourceVirtualModules.get(source);
	if (!stale) return;
	for (const id of stale) {
		virtualModules.delete(id);
	}
	sourceVirtualModules.delete(source);
}

function stripBuildPrefix(fileName: string) {
	return fileName.startsWith(MARKLESS_BUILD_PREFIX)
		? fileName.slice(MARKLESS_BUILD_PREFIX.length)
		: fileName;
}

function virtualModuleSourceForLoad(
	module: MarklessVirtualModule,
	options: {
		readonly dev: boolean;
		readonly publicPath?: (fileName: string) => string;
	},
) {
	if (!options.dev || module.type !== 'resolver') return module.source;
	if (!module.source.includes('moduleUrls[row[0]]')) return module.source;

	return module.source.replace(SYMBOL_VIRTUAL_STRING_RE, (_match, _quote, virtualId) =>
		JSON.stringify(devBrowserVirtualModuleUrl(virtualId, options.publicPath)),
	);
}

// Always the /@fs/<absolute> form, even for sources under the Vite root: a
// root-relative source URL (e.g. /pages/r/[repo]/index.tsrx?import) collides
// with the app's own route space on framework dev servers (nitro routes it
// and 404s), which kills the first full-resume wake in dev. Vite serves
// /@fs URLs for any allowed path and resolves them to the same module-graph
// entry, so the HMR full-reload contract is unchanged.
function devBrowserSourceModuleUrl(
	source: string,
	_root: string | undefined,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = withQuery(joinURL('@fs', withoutLeadingSlash(source)), { import: null });
	return publicPath ? publicPath(path) : joinURL('/', path);
}

function devBrowserVirtualModuleUrl(
	virtualId: string,
	publicPath: ((fileName: string) => string) | undefined,
) {
	const path = joinURL('@id', resolveVirtualId(virtualId).replace('\0', '__x00__'));
	return publicPath ? publicPath(path) : joinURL('/', path);
}

function clientSymbolEntries(input: unknown, root: string | undefined): string[] {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return [];
	}

	const sources: string[] = [];
	for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
		if (!/symbol/i.test(name)) continue;
		for (const entry of inputEntryValues(value)) {
			if (typeof entry === 'string' && TSRX_SOURCE_FILE.test(entry)) {
				sources.push(normalizeInputSource(entry, root));
			}
		}
	}
	return sources;
}

function inputEntryValues(value: unknown): unknown[] {
	return Array.isArray(value) ? value.flatMap(inputEntryValues) : [value];
}

function normalizeInputSource(source: string, root: string | undefined) {
	const path = pathname(source);
	if (isAbsolute(path)) return path;
	return pathname(resolve(root ?? '', path));
}

function isSymbolOnlySourceRequest(id: string): boolean {
	return MARKLESS_SYMBOL_SOURCE_QUERY_RE.test(id);
}

function isResumeSourceRequest(id: string): boolean {
	return MARKLESS_RESUME_SOURCE_QUERY_RE.test(id);
}

function sourceForSymbolVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	return symbolVirtualModuleSourceFile(normalizeVirtualId(importer));
}

function sourceForResumeVirtualImporter(importer: string | undefined): string | null {
	if (!importer) return null;

	const match = normalizeVirtualId(importer).match(RESUME_VIRTUAL_ID_RE);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
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

function isRelativeImport(source: string): boolean {
	return source.startsWith('./') || source.startsWith('../');
}

function isMarklessRuntimeModule(id: string): boolean {
	const path = pathname(id);
	return /[/\\](?:web|runtime|serializer)[/\\]src[/\\].+\.ts$/.test(path);
}

function executionLogRuntimeModuleId(id: string): string {
	const path = pathname(id);
	const match = path.match(/[/\\](web|runtime|serializer)[/\\]src[/\\]([^?#]+)\.ts$/);
	return match ? `${match[1]}:${match[2].replace(/[/\\]/g, '/')}` : path;
}

function normalizeVirtualId(id: string) {
	const bare = id.startsWith('\0') ? id.slice(1) : id;
	if (!bare.startsWith(MARKLESS_VIRTUAL_PREFIX)) return bare;
	// Markless virtual ids embed the encodeURIComponent'd source path and END
	// in .tsrx, so dev requests arrive mangled twice: Vite's import analysis
	// appends `?import` as if they were assets, and the /@id middleware
	// decodeURI()s the path — %2F survives (reserved) but %5B/%5D decode to
	// raw brackets, so ids for pages like pages/r/[repo] come in
	// half-decoded. Strip the query and re-canonicalize each colon segment to
	// the registered encoding, or the first full-resume wake in dev 404s on
	// its payload/view imports.
	const queryIndex = bare.indexOf('?');
	const withoutQuery = queryIndex === -1 ? bare : bare.slice(0, queryIndex);
	const segments = withoutQuery
		.slice(MARKLESS_VIRTUAL_PREFIX.length)
		.split(':')
		.map((segment) => {
			try {
				return encodeURIComponent(decodeURIComponent(segment));
			} catch {
				return segment;
			}
		});
	return `${MARKLESS_VIRTUAL_PREFIX}${segments.join(':')}`;
}

function resolveVirtualId(id: string) {
	if (id.startsWith('\0')) {
		return id;
	}

	return `\0${id}`;
}

function pathname(id: string) {
	return parsePath(id).pathname;
}

export { MARKLESS_BUNDLE_GRAPH, MARKLESS_BUILD_PREFIX, outputDefaults } from './build/chunking.ts';
export { createBuildMetadata } from './build/build-metadata.ts';
export { convertManifestToBundleGraph, createPreloadGraphAdder } from './build/bundle-graph.ts';
export { collectHeadLinkInjections } from './build/head-links.ts';
export {
	MARKLESS_VIRTUAL_PREFIX,
	resumeVirtualModuleId,
	transformTsrxModule,
} from './transform.ts';
