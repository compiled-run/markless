import { dirname, isAbsolute, resolve } from 'pathe';
import {
	artifactChildCandidates,
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	componentEdgeSymbolRoutes,
	emitSymbolResolverModule,
	importedSymbolRoutes,
	linkedRenderDataBoundarySymbols,
	moduleInterfaceHash,
	prerenderInterfacesComplete,
	type BoundSymbolResolverRow,
	type CompilerDiagnostic,
	type CompileTsrxModuleResult,
	type RenderDataArtifact,
	type RuntimeDemandMapArtifact,
	type RuntimeDemandMapRecordKind,
} from '@markless/compiler';
import {
	PROTOCOL_EVENT_ACTION_KIND,
	createStorageSeedMetadataFromGraphNodeId,
	jsonSourceWithNonFiniteNumbers,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import type {
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	SMALL_SYMBOL_DIRECT_LOAD_LIMIT,
	emitResumeModule,
	emitSettleModule,
	emitSourceModule,
	payloadModule,
	prerenderWakeVirtualModuleId,
	resumeVirtualModuleId,
	rewriteSymbolModuleExport,
	scopedSymbolExportName,
	settleVirtualModuleId,
	symbolVirtualModuleId,
	type BoundSymbolDescriptor,
	type BoundSymbolDescriptorMap,
	type SourceSymbolRow,
} from './source-module.ts';
import type { PrerenderSettleBoundMap } from '@markless/web/inline/resumer';
import { injectExecutionLogModuleHook, normalizeExecutionLogMode } from './execution-log.ts';
import {
	compileInlineResumerSources,
	compilePrerenderInlineResumerSources,
} from './inline-resumer.ts';
import { createCompileErrorPayload, MarklessCompileError } from './dev-error/index.ts';
import {
	emitPrerenderBoundaryRendererModule,
	emitPrerenderTriggerGroupModule,
	planPrerenderTriggerGroups,
	triggerGroupVirtualModuleId,
} from './trigger-groups.ts';
import { adaptImportedCaptureResolver } from './bound-resolver.ts';
import { emitSymbolBundleModule, planSymbolBundles } from './build/symbol-bundles.ts';

// Authored TS (param annotations, assertions, type aliases) survives compilation
// into emitted module code, but downstream consumers (Vite builtins, symbol
// virtual modules) parse it as JS. Strip types at emission — Rolldown-native.
// Loaded lazily: rolldown/experimental binds native code that must never enter
// the browser module graph (dev client imports this file's module scope).
let oxcTransformSyncPromise:
	| Promise<typeof import('rolldown/experimental').transformSync | undefined>
	| undefined;
function loadOxcTransformSync() {
	oxcTransformSyncPromise ??= import('rolldown/experimental').then(
		(mod) => mod.transformSync,
		() => undefined,
	);
	return oxcTransformSyncPromise;
}

// Returning the raw code on failure ships TypeScript to a JS parser, so every
// exit here is loud: a silent pass-through is the defect this guards.
export async function stripEmittedTypes(
	code: string,
	moduleId: string,
	onlyRemoveTypeImports = false,
): Promise<string> {
	const oxcTransformSync = await loadOxcTransformSync();
	if (!oxcTransformSync) {
		throw typeStripError(moduleId, 'rolldown/experimental exposes no transformSync.');
	}
	let out: ReturnType<typeof oxcTransformSync>;
	try {
		out = oxcTransformSync(
			'markless-emitted.ts',
			code,
			onlyRemoveTypeImports ? { typescript: { onlyRemoveTypeImports: true } } : undefined,
		);
	} catch (error) {
		throw typeStripError(moduleId, error instanceof Error ? error.message : String(error));
	}
	// transformSync reports failures via `errors` with empty output instead of throwing.
	const errors = out.errors ?? [];
	if (errors.length > 0 || !out.code) {
		throw typeStripError(
			moduleId,
			errors.map((error) => error.message).join('; ') || 'oxc produced no output.',
		);
	}
	return out.code;
}

// An authored slice spliced into generated code. Reprinting one that carries no
// TypeScript would inflate every module that has one, so a fragment oxc already
// accepts as JS keeps its exact bytes and only a genuinely-TS one is rewritten.
async function stripEmittedTypesFromFragment(
	code: string,
	moduleId: string,
	onlyRemoveTypeImports = false,
): Promise<string> {
	if (await parsesAsJavaScript(code)) return code;
	return (await stripEmittedTypes(code, moduleId, onlyRemoveTypeImports)).trim();
}

// An authored expression, not a statement: oxc prints it as one, so the
// statement terminator has to come back off before it is spliced into a record.
async function stripEmittedTypesFromExpression(
	source: string,
	moduleId: string,
): Promise<string> {
	const stripped = await stripEmittedTypesFromFragment(source, moduleId);
	return stripped.endsWith(';') ? stripped.slice(0, -1).trimEnd() : stripped;
}

async function parsesAsJavaScript(code: string): Promise<boolean> {
	const oxcTransformSync = await loadOxcTransformSync();
	if (!oxcTransformSync) return false;
	try {
		return (oxcTransformSync('markless-emitted.js', code).errors?.length ?? 0) === 0;
	} catch {
		return false;
	}
}

function typeStripError(moduleId: string, message: string): MarklessCompileError {
	return new MarklessCompileError(
		createCompileErrorPayload({
			filename: moduleId,
			source: '',
			diagnostics: [],
			details: `MARKLESS_TYPE_STRIP_FAILED: ${moduleId} could not have its TypeScript syntax stripped. ${message}`,
		}),
	);
}

export {
	MARKLESS_VIRTUAL_PREFIX,
	prerenderWakeVirtualModuleId,
	resumeVirtualModuleId,
} from './source-module.ts';

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	return transformTsrxModuleWithPrerenderWakeClosure(input, false);
}

// Reads back the owner of `virtual:markless:<kind>:<encoded source>[:<detail>]`,
// the shape every generated id above is minted in; style ids append `.css`.
// Accepts rolldown-resolved ids (leading `\0`); null when the id carries no source.
export function marklessVirtualModuleSourceFile(moduleId: string): string | null {
	const bare = moduleId.startsWith('\0') ? moduleId.slice(1) : moduleId;
	if (!bare.startsWith(MARKLESS_VIRTUAL_PREFIX)) return null;
	const rest = bare.slice(MARKLESS_VIRTUAL_PREFIX.length);
	const kindEnd = rest.indexOf(':');
	if (kindEnd <= 0) return null;
	const encoded = rest.slice(kindEnd + 1).split(':')[0].replace(/\.css$/, '');
	if (!encoded) return null;
	try {
		return decodeURIComponent(encoded);
	} catch {
		return null;
	}
}

// Rolldown owns linked child manifests. Keep their capability closure internal
// instead of adding it to the consumer-facing transform input contract.
export async function transformTsrxModuleWithPrerenderWakeClosure(
	input: TransformTsrxModuleInput,
	linkedChildHasBrowserTriggers: boolean,
): Promise<TransformTsrxModuleResult> {
	const encodedFilename = encodeURIComponent(input.filename);
	const payloadId = `${MARKLESS_VIRTUAL_PREFIX}payload:${encodedFilename}`;
	const renderDataId = `${MARKLESS_VIRTUAL_PREFIX}render-data:${encodedFilename}`;
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodedFilename}`;
	const resumeId = resumeVirtualModuleId(input.filename);
	const prerenderWakeId = prerenderWakeVirtualModuleId(input.filename);
	const settleId = settleVirtualModuleId(input.filename);
	const { compiled: compiledForAllClasses, blockingDiagnostics } =
		await compileWithBlockingDiagnostics(input, resolverId);
	throwIfBlocked(input, blockingDiagnostics);
	const runtimeDemandClass = input.runtimeDemandClass ?? 'prerender';
	const compiled = {
		...compiledForAllClasses,
		runtimeDemandMap:
			compiledForAllClasses.runtimeDemandMaps?.[runtimeDemandClass] ??
			compiledForAllClasses.runtimeDemandMap,
	};
	const compilerSymbolRows = compiled.symbolModules.modules.map((module) => ({
		id: module.symbolId,
		chunk: symbolVirtualModuleId(input.filename, module.symbolId),
		exportName: scopedSymbolExportName(input.filename, module.exportName),
	}));
	const linkedBoundarySymbols = linkedRenderDataBoundarySymbols(
		linkedSymbolInput(compiled, input, renderDataId, resolverId, input.environment === 'client'),
	);
	const symbolRows = [
		...compilerSymbolRows,
		...linkedBoundarySymbols.map((symbol) => symbol.row),
	];
	const behaviorSymbolIds = new Set(
		(compiled.protocolView.behaviors ?? []).flatMap((behavior) =>
			behavior.symbolId ? [behavior.symbolId] : [],
		),
	);
	const behaviorSymbols = compilerSymbolRows.filter((symbol) => behaviorSymbolIds.has(symbol.id));
	const importedBoundRows = compiled.boundSymbolResolver.rows.map((row) =>
		row.loaderSymbolId ? { ...row, baseSymbolId: row.loaderSymbolId } : row,
	);
	const boundSymbolDescriptors = perBoundaryBoundSymbolDescriptors(
		compiled.renderData,
		importedBoundRows,
	);
	const resolverSymbols = uniqueSymbolsById([...(input.symbols ?? []), ...symbolRows]);
	const resolverSource = adaptImportedCaptureResolver(
		emitSymbolResolverModule({
			buildId: input.buildId,
			symbols: resolverSymbols,
			boundSymbols: importedBoundRows,
		}),
		importedBoundRows.some((row) => row.loaderSymbolId !== undefined),
	);
	const symbolRoutes = componentEdgeSymbolRoutes(compiled, input.artifactChildMaterializations);
	const executionLogModuleHookMode =
		input.executionLogModuleHooks === false ? 'never' : input.executionLog;
	const symbolManifestEntries = [
		...compiled.symbolModules.modules.map((module, index) => ({
			symbolId: module.symbolId,
			kind: module.kind,
			exportName: compilerSymbolRows[index]!.exportName,
			virtualModuleId: symbolVirtualModuleId(input.filename, module.symbolId),
		})),
		...linkedBoundarySymbols.map((symbol) => symbol.manifest),
	];
	const prerenderTriggerGroups =
		input.prerenderRecordData && input.prerenderWakeVariant
			? planPrerenderTriggerGroups({
					filename: input.filename,
					...input.prerenderRecordData,
					completeView: containerScopedResumeView(compiled.protocolView),
					triggerGroups: compiled.triggerGroups,
					symbolResolver: compiled.symbolResolver,
					boundRows: importedBoundRows,
					componentEdges: compiled.semanticGraph.componentEdges,
				})
			: [];
	const selfWakeArmRendererId = prerenderTriggerGroups.some((group) => group.id === 'self-wake')
		? triggerGroupVirtualModuleId(input.filename, prerenderTriggerGroups.length)
		: undefined;
	// The prerender wake closure is the richer wake set when a page has one; the
	// compiler's trigger groups answer for every other page.
	const symbolBundles =
		symbolRows.length > SMALL_SYMBOL_DIRECT_LOAD_LIMIT
			? planSymbolBundles({
					filename: input.filename,
					symbols: compiled.symbolModules.modules.map((module) => ({
						symbolId: module.symbolId,
						moduleId: symbolVirtualModuleId(input.filename, module.symbolId),
					})),
					interactions:
						prerenderTriggerGroups.length > 0
							? prerenderTriggerGroups
							: compiled.triggerGroups.groups,
				})
			: [];
	// Scoped <style> CSS ships through the bundler's CSS pipeline: a virtual
	// .css module imported by the transformed module, never inline JS.
	// Every scope in the plan ships; taking only the first would drop CSS silently.
	const styleCss = compiled.publicRenderPlan.styleScopes
		.map((scope) => scope.cssText)
		.join('\n');
	const styleId =
		compiled.publicRenderPlan.styleScopes.length > 0
			? `${MARKLESS_VIRTUAL_PREFIX}style:${encodedFilename}.css`
			: null;
	const pageNeedsFullResume = needsFullResume(
		compiled.protocolState,
		compiled.protocolView,
		compiled.runtimeDemandMap,
	);
	const prerenderClosureNeedsWake =
		pageNeedsFullResume || (input.prerenderRecords === true && linkedChildHasBrowserTriggers);
	const emitsPrerenderWakeVariant =
		input.prerenderWakeVariant === true &&
		compiled.publicRenderModule.renderDataModuleSource !== undefined &&
		prerenderInterfacesComplete(compiled, input) &&
		prerenderClosureNeedsWake;
	const emitsPrerenderWakeFacade =
		input.prerenderWakeFacade === true &&
		input.prerenderWakeVariant === true &&
		compiled.publicRenderModule.renderDataModuleSource !== undefined &&
		prerenderInterfacesComplete(compiled, input) &&
		prerenderClosureNeedsWake;
	// The per-page wake facade owns wake-shaped symbol routes.
	const manifestOwnsSymbolRoutes =
		input.prerenderWakeVariant !== true ||
		input.preserveWakeSiblingClaims === true ||
		emitsPrerenderWakeFacade;
	const manifest: MarklessTransformManifest = {
		source: input.filename,
		captureMetadata: compiled.captureAnalysis,
		symbolRoutes: importedSymbolRoutes(symbolRoutes),
		payload: { virtualModuleId: payloadId },
		resolver: {
			virtualModuleId: emitsPrerenderWakeFacade ? prerenderWakeId : resolverId,
		},
		symbols: manifestOwnsSymbolRoutes ? symbolManifestEntries : [],
		runtimeDemandMap: compiled.runtimeDemandMap,
	};
	// The settle module and the fill plan travel together: both exist only for a
	// prerendered page whose wake variant is emitted, so a page that never ships
	// a plan never ships a settle module either.
	const settlePlan = planSettleModule({
		boundaries: compiled.renderData?.boundaries,
		asyncRunners: compiled.protocolView.asyncRunners,
		descriptors: boundSymbolDescriptors,
		// Imported children's base symbols reach this page through the resolver's
		// symbol inputs, not through this page's own rows.
		symbols: resolverSymbols,
	});
	const prerenderBootVariants =
		input.environment === 'server' ? await compilePrerenderInlineResumerSources() : undefined;
	const prerenderBoot = prerenderBootVariants
		? {
				...prerenderBootVariants,
				...(input.settleModuleUrl && settlePlan
					? {
							settle: {
								moduleUrl: input.settleModuleUrl,
								boot: prerenderBootVariants.prerenderSettle,
								bound: settlePlan.bound,
							},
						}
					: {}),
			}
		: undefined;
	// Keep ordinary client render-data modules recursively linkable.
	const linkedClientRenderData = input.environment === 'client' && !input.prerenderRecords;
	const canonicalRenderData =
		(input.prerenderRecords || linkedClientRenderData) &&
		prerenderInterfacesComplete(compiled, input);
	const virtualModules: MarklessVirtualModule[] = [
		...(compiled.publicRenderModule.renderDataModuleSource
			? [
					{
						id: renderDataId,
						type: 'render-data' as const,
						...(canonicalRenderData ? { canonicalRenderData: true } : {}),
						// Prerender emission requires every imported child's linked
						// render-data interface. An incomplete set is an ELIGIBILITY
						// boundary, not a failure: the pre-link pass defers to the
						// linked pass, and pages composing artifact-shaped package
						// children (e.g. the router's Link) stay on the payload
						// container until artifact-child prerender lands.
						source: canonicalRenderData
							? await prerenderDataModuleSource(
									compiled,
									input.importedModuleInterfaces,
									input.renderDataImportSources,
									input.artifactChildMaterializations,
									input.filename,
								)
							: compiled.publicRenderModule.renderDataModuleSource,
					},
				]
			: []),
		...(styleId ? [{ id: styleId, type: 'style' as const, source: styleCss }] : []),
		{
			id: payloadId,
			type: 'payload',
			source: payloadModule({
				...compiled.payloadScripts,
				runtimeDemandMap: compiled.runtimeDemandMap,
			}),
		},
		{
			id: resolverId,
			type: 'resolver',
			source: resolverSource,
			symbolClaims: [
				...new Set([
					...resolverSymbols.map((symbol) => symbol.id),
					...importedBoundRows.map((symbol) => symbol.id),
				]),
			],
		},
		{
			id: resumeId,
			type: 'resume',
			source: emitResumeModule({
				payloadId,
				resolverId,
				payloadState: compiled.payloadScripts.state,
				payloadView: containerScopedResumeView(compiled.payloadScripts.view),
				runtimeDemandMap: compiled.runtimeDemandMap,
				executionLog: input.executionLog,
				// The capability closure (page + linked children) decides the wake;
				// the variant is ADDITIVE: CSR prerender pages boot through this
				// regular resume module, so suppressing its records mode when a
				// variant also exists strands them on the payload path. Ineligible
				// pages (artifact-shaped package children) emit ordinary render
				// data, so records mode must not import from it.
				needsFullResume: prerenderClosureNeedsWake,
				// Trigger groups are the staged FIRST choice, not a replacement:
				// the unmatched-interaction fallback derives from the render-data
				// surface, so staged modules keep their prerenderDataId.
				prerenderDataId:
					input.prerenderRecords && prerenderInterfacesComplete(compiled, input)
						? renderDataId
						: undefined,
				// Only the canonical emission exports `marklessPrerenderData`, so a page
				// without one has no surface a component row could be minted against.
				renderDataId:
					canonicalRenderData && compiled.publicRenderModule.renderDataModuleSource
						? renderDataId
						: undefined,
				hasBoundSymbols: compiled.boundSymbolResolver.rows.length > 0,
				boundSymbolDescriptors,
				symbols: symbolRows,
				symbolRoutes,
			}),
		},
		...(emitsPrerenderWakeVariant
			? [
					{
						id: prerenderWakeId,
						type: 'prerender-wake' as const,
						source: emitResumeModule({
							payloadId,
							resolverId,
							payloadState: compiled.payloadScripts.state,
							payloadView: containerScopedResumeView(compiled.payloadScripts.view),
							runtimeDemandMap: compiled.runtimeDemandMap,
							executionLog: input.executionLog,
							needsFullResume: prerenderClosureNeedsWake,
							prerenderDataId: renderDataId,
							prerenderTriggerGroups: prerenderTriggerGroups.map((group, index) => ({
								...group,
								moduleId: triggerGroupVirtualModuleId(input.filename, index),
							})),
							installResumeSummary: true,
							recordsOnly: true,
							hasBoundSymbols: compiled.boundSymbolResolver.rows.length > 0,
							boundSymbolDescriptors,
							symbols: symbolRows,
							symbolRoutes,
						}),
					},
				]
			: []),
		...(emitsPrerenderWakeVariant && settlePlan
			? [
					{
						id: settleId,
						type: 'settle' as const,
						source: emitSettleModule(settlePlan),
					},
				]
			: []),
		...(input.prerenderWakeVariant ? prerenderTriggerGroups : []).map(
			(group, index): MarklessVirtualModule => ({
				id: triggerGroupVirtualModuleId(input.filename, index),
				type: 'trigger-group',
				source: emitPrerenderTriggerGroupModule({
					group,
					symbols: uniqueSymbolsById([...(input.symbols ?? []), ...symbolRows]),
					boundRows: importedBoundRows,
					// Every route, not just the ones naming a child module: a
					// prerendered page owns same-module children the same way a CSR one
					// does. Only the MANIFEST is import-source-only.
					symbolRoutes,
					armRendererModuleId:
						group.id === 'self-wake' ? selfWakeArmRendererId : undefined,
				}),
			}),
		),
		...(selfWakeArmRendererId
			? [
					{
						id: selfWakeArmRendererId,
						type: 'trigger-group' as const,
						source: emitPrerenderBoundaryRendererModule(renderDataId),
					},
				]
			: []),
		...symbolBundles.map(
			(bundle): MarklessVirtualModule => ({
				id: bundle.id,
				type: 'symbol-bundle',
				source: emitSymbolBundleModule(bundle.symbolModuleIds),
				bundledSymbolModuleIds: bundle.symbolModuleIds,
			}),
		),
		...linkedBoundarySymbols.map((symbol) => symbol.module),
		...(await Promise.all(
			compiled.symbolModules.modules.map(
				async (module, index): Promise<MarklessVirtualModule> => ({
					id: symbolVirtualModuleId(input.filename, module.symbolId),
					type: 'symbol',
					symbolId: module.symbolId,
					exportName: symbolRows[index]!.exportName,
					source: injectExecutionLogModuleHook(
						await stripEmittedTypes(
							rewriteSymbolModuleExport(
								module.source,
								module.exportName,
								symbolRows[index]!.exportName,
							),
							symbolVirtualModuleId(input.filename, module.symbolId),
						),
						`symbol:${module.symbolId}`,
						executionLogModuleHookMode,
					),
				}),
			),
		)),
	];

	const styleImport = styleId ? `import ${JSON.stringify(styleId)};\n` : '';
	const inlineResumerSources =
		(input.environment ?? 'lib') === 'client'
			? undefined
			: await compileInlineResumerSources({
					debug: input.inlineResumerDebug === true,
					executionLog: input.executionLog ?? 'never',
				});
	const headInjections = [
		...(input.headInjections ?? []),
		...(styleId && input.styleModuleUrl
			? [
					{
						tag: 'link',
						location: 'head' as const,
						attributes: { rel: 'stylesheet', href: input.styleModuleUrl(styleId) },
					},
				]
			: []),
	];
	const storageSeeds = compiled.payloadArena.state.storage.map((storage) => {
		const binding = compiled.semanticGraph.graphBindings.find(
			(candidate) => candidate.id === storage.graphNodeId,
		);
		if (typeof binding?.initialValue !== 'string') {
			throw new Error(
				`MARKLESS_STORAGE_SEED_FALLBACK_MISSING: ${storage.graphNodeId} has no static string fallback.`,
			);
		}
		return createStorageSeedMetadataFromGraphNodeId(
			storage.graphNodeId,
			storage.key,
			binding.initialValue,
		);
	});
	return {
		code:
			styleImport +
			(await stripEmittedTypes(
				emitSourceModule({
					filename: input.filename,
					dev: input.dev,
					payloadId,
					resolverId,
					renderDataId,
					environment: input.environment ?? 'lib',
					clientOutput: input.clientOutput ?? 'full',
					executionLog: input.executionLog,
					headInjections: headInjections.length > 0 ? headInjections : undefined,
					storageSeeds: storageSeeds.length > 0 ? storageSeeds : undefined,
					inlineResumerSources,
					prerenderBoot,
					devResumeReexport: input.devResumeReexport === true,
					// The container-event route serves linked children too, so the
					// closure verdict, not the page-only one, decides its emission.
					needsFullResume: prerenderClosureNeedsWake,
					prerenderRecords: input.prerenderRecords,
					directCsr: input.directCsr,
					hasComputedState: compiled.payloadScripts.state.computed.length > 0,
					hasOverlayMarks: compiled.runtimeDemandMap.payloadRecords.some(
						(record) => record.kind === 'overlay',
					),
					runtimeDemandMap: compiled.runtimeDemandMap,
					resumeModuleUrl: input.resumeModuleUrl,
					prerenderWakeModuleUrl: input.prerenderWakeModuleUrl,
					publicRenderModuleSource: compiled.publicRenderModule.moduleSource,
					publicRenderRootExportName: compiled.publicRenderModule.rootExportName,
					publicSsrModuleSource: compiled.publicRenderModule.ssrModuleSource,
					publicRenderSsrExportName: compiled.publicRenderModule.ssrExportName,
					publicRenderSsrComponentExports:
						compiled.publicRenderModule.ssrComponentExports,
					canonicalRenderData: prerenderInterfacesComplete(compiled, input),
					// The interface publishes exactly the shared definitions this
					// module owns AND exports, each under the name it exports it as,
					// so the emitted module keeps the binding a `.ts` barrel links.
					sharedDefinitionExports: compiled.moduleGraphInterface?.sharedDefinitions?.map(
						(published) => published.exportName,
					),
					hasBoundSymbols: compiled.boundSymbolResolver.rows.length > 0,
					symbols: symbolRows,
					behaviorSymbols,
					symbolRoutes,
				}),
				input.filename,
			)),
		map: null,
		virtualModules,
		manifest,
		moduleGraphInterface: compiled.moduleGraphInterface,
		interfaceHash: moduleInterfaceHash(compiled.moduleGraphInterface),
		moduleImports: compiled.semanticGraph.moduleImports,
		artifactChildren: artifactChildCandidates(compiled),
	};
}

// A relative specifier in the render-data virtual module would resolve against
// the virtual id, not the authored file that wrote it, so it is rebound here.
function resolveAuthoredSpecifier(specifier: string, sourceFilename: string): string {
	if (!specifier.startsWith('.')) return specifier;
	if (!isAbsolute(sourceFilename)) {
		throw new Error(
			`MARKLESS_RENDER_DATA_READER_SPECIFIER_UNRESOLVABLE: ${JSON.stringify(specifier)} needs an absolute module filename, got ${JSON.stringify(sourceFilename)}.`,
		);
	}
	return resolve(dirname(sourceFilename), specifier);
}

async function prerenderDataModuleSource(
	compiled: CompileTsrxModuleResult,
	importedModuleInterfaces: TransformTsrxModuleInput['importedModuleInterfaces'],
	renderDataImportSources: TransformTsrxModuleInput['renderDataImportSources'],
	artifactChildMaterializations: TransformTsrxModuleInput['artifactChildMaterializations'],
	sourceFilename: string,
): Promise<string> {
	const importedComponents = new Map<
		string,
		{ readonly source: string; readonly local: string }
	>();
	for (const edge of compiled.semanticGraph.componentEdges) {
		if (!edge.importSource || importedComponents.has(edge.childComponentName)) continue;
		if (artifactChildMaterializations?.[edge.id]) continue;
		const linked = importedModuleInterfaces?.[edge.importSource];
		if (!linked) {
			throw new Error(
				`MARKLESS_PRERENDER_RENDER_DATA_MISSING: Imported child ${JSON.stringify(edge.childComponentName)} from ${JSON.stringify(edge.importSource)} has no linked render-data artifact.`,
			);
		}
		importedComponents.set(edge.childComponentName, {
			source:
				renderDataImportSources?.[edge.importSource] ??
				`${MARKLESS_VIRTUAL_PREFIX}render-data:${encodeURIComponent(linked.filename)}`,
			local: `marklessPrerenderImport${importedComponents.size}`,
		});
	}
	// The authored-expression reader is compiled code, not data: it is spliced
	// into the component record instead of travelling through JSON.stringify.
	// Its module-scope needs travel structurally so relative specifiers can be
	// rebound to the authored file — this virtual module is not its neighbour.
	//
	// These three fields are the only authored slices in this module, so they are
	// the only ones the type stripper touches: reprinting the whole emission grows
	// the JSON blob and breaks the CSS entries beside it.
	const renderDataId = `${MARKLESS_VIRTUAL_PREFIX}render-data:${encodeURIComponent(sourceFilename)}`;
	const readerImports = new Map<string, string>();
	const readerDeclarations = new Map<string, string>();
	const componentEntries: string[] = [];
	for (const definition of compiled.publicRenderModule.componentDefinitions) {
		const {
			residueReaderSource,
			residueReaderImports,
			residueReaderDeclarations,
			// A build-time gate answer, not render data: stripped here so widening the
			// gate adds no payload byte to the modules it turns the pass on for.
			rootsWidget: _rootsWidget,
			...record
		} = definition as Readonly<Record<string, unknown>> & {
			readonly residueReaderSource?: string;
			readonly residueReaderImports?: ReadonlyArray<{
				readonly source: string;
				readonly line: string;
			}>;
			readonly residueReaderDeclarations?: ReadonlyArray<string>;
			readonly rootsWidget?: boolean;
		};
		for (const entry of residueReaderImports ?? []) {
			if (readerImports.has(entry.line)) continue;
			const rebound = entry.line.replace(
				JSON.stringify(entry.source),
				JSON.stringify(resolveAuthoredSpecifier(entry.source, sourceFilename)),
			);
			// A lone import statement has no use site here, so the stripper must not
			// be allowed to treat it as unused and delete it.
			readerImports.set(
				entry.line,
				await stripEmittedTypesFromFragment(rebound, `${renderDataId}:reader-import`, true),
			);
		}
		for (const line of residueReaderDeclarations ?? []) {
			if (readerDeclarations.has(line)) continue;
			readerDeclarations.set(
				line,
				await stripEmittedTypesFromFragment(line, `${renderDataId}:reader-declaration`),
			);
		}
		const data = jsonSourceWithNonFiniteNumbers(record) ?? 'undefined';
		const reader = residueReaderSource
			? await stripEmittedTypesFromExpression(
					residueReaderSource,
					`${renderDataId}:reader:${String(definition.name)}`,
				)
			: undefined;
		componentEntries.push(
			`${JSON.stringify(String(definition.name))}:${
				reader ? `{...${data},readResidue:${reader}}` : data
			}`,
		);
	}
	const preludes = [...readerImports.values(), ...readerDeclarations.values()];
	// Pay-per-use gate: this module's render data is loaded by exactly the pages
	// that compose it, so a build that needs nothing from the pass never loads it.
	//
	// Two facts turn it on, because the pass does two jobs. It RUNS a widget
	// root's shared seeds, which a module with a `shared-seed` symbol needs; and
	// it FILES the widget-instance token every `shared()` element() handle mints
	// its id from, which a module that roots a widget-scoped family needs whether
	// or not that family plans a seed. A family of element() handles over constant
	// state plans no seed symbol at all, so gating on seeds alone left its parts
	// minting against a token nobody had filed (MARKLESS_ELEMENT_HANDLE_WIDGET_
	// INSTANCE_MISSING on CSR, while SSR's own marker answered). `rootsWidget` is
	// the compiler's `widgetRootComponents` answer for this module — the same fact
	// the SSR `marklessWidgetRoots` marker publishes — and it is stripped from the
	// record above, so a module the gate turns on pays only the two lines below.
	const seedsShared = compiled.publicRenderModule.componentDefinitions.some((definition) => {
		const record = definition as {
			readonly initialValueKinds?: Readonly<Record<string, string>>;
			readonly rootsWidget?: boolean;
		};
		return (
			record.rootsWidget === true ||
			Object.values(record.initialValueKinds ?? {}).includes('shared-seed')
		);
	});
	return [
		...(seedsShared
			? [
					"import { installMarklessSharedSeedPass } from '@markless/web/fns/shared-seed';",
					'installMarklessSharedSeedPass();',
				]
			: []),
		...[...importedComponents.values()].map(
			(entry) =>
				`import { marklessPrerenderData as ${entry.local} } from ${JSON.stringify(entry.source)};`,
		),
		...preludes,
		compiled.publicRenderModule.renderDataModuleSource,
		`const marklessPrerenderComponents = {${componentEntries.join(',')}};`,
		'export const marklessPrerenderData = {',
		`\trootComponentName: ${JSON.stringify(compiled.renderData.root?.componentName ?? null)},`,
		'\trenderData: marklessRenderData,',
		'\tcomponents: marklessPrerenderComponents,',
		`\timports: {${[...importedComponents].map(([name, entry]) => `${JSON.stringify(name)}:${entry.local}`).join(',')}},`,
		'};',
	].join('\n');
}

export async function preflightTsrxModuleDiagnostics(
	input: Pick<TransformTsrxModuleInput, 'filename' | 'source' | 'buildId'>,
): Promise<void> {
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodeURIComponent(input.filename)}`;
	const { blockingDiagnostics } = await compileWithBlockingDiagnostics(input, resolverId);
	throwIfBlocked(input, blockingDiagnostics);
}

// The naming closures that decide what this bundler links. Naming a branch
// export is what fulfils an escalation candidate, so the same call answers both
// "what do we emit" and "which refusal still stands".
function linkedSymbolInput(
	compiled: CompileTsrxModuleResult,
	input: Pick<
		TransformTsrxModuleInput,
		'filename' | 'importedModuleInterfaces' | 'artifactChildMaterializations'
	>,
	renderDataId: string,
	resolverId: string,
	clientLink: boolean,
) {
	return {
		compiled,
		link: input,
		clientLink,
		renderDataId,
		resolverId,
		symbolModuleId: (symbolId: string) => symbolVirtualModuleId(input.filename, symbolId),
		boundaryExportName: (index: number) =>
			scopedSymbolExportName(input.filename, `marklessLinkedBoundaryUpdate${index}`),
		branchExportName: (index: number) =>
			scopedSymbolExportName(input.filename, `marklessLinkedBranchUpdate${index}`),
	} satisfies Parameters<typeof linkedRenderDataBoundarySymbols>[0];
}

// The client link ships the escalation symbol, so it decides the refusal for
// every environment: a server build must not refuse the shape its own client
// build knows how to flip.
function fulfilledEscalationSymbolIds(
	compiled: CompileTsrxModuleResult,
	input: Pick<
		TransformTsrxModuleInput,
		'filename' | 'importedModuleInterfaces' | 'artifactChildMaterializations'
	>,
	resolverId: string,
): ReadonlySet<string> {
	if ((compiled.symbolModules.armEscalationCandidates ?? []).length === 0) return new Set();
	const renderDataId = `${MARKLESS_VIRTUAL_PREFIX}render-data:${encodeURIComponent(input.filename)}`;
	return new Set(
		linkedRenderDataBoundarySymbols(
			linkedSymbolInput(compiled, input, renderDataId, resolverId, true),
		).flatMap((symbol) => (symbol.manifest.kind === 'branch-update' ? [symbol.row.id] : [])),
	);
}

async function compileWithBlockingDiagnostics(
	input: Pick<
		TransformTsrxModuleInput,
		| 'filename'
		| 'source'
		| 'buildId'
		| 'symbols'
		| 'importedModuleInterfaces'
		| 'artifactChildMaterializations'
		| 'executionLog'
	>,
	resolverId: string,
) {
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		buildId: input.buildId,
		resolverId,
		symbols: input.symbols ?? [],
		importedModuleInterfaces: input.importedModuleInterfaces,
		artifactChildMaterializations: input.artifactChildMaterializations,
		// 'never' is the consumer posture (MARKLESS_CONSUMER_BUILD); the lab
		// default 'auto' keeps the authored-source strings for dev tooling.
		omitAuthoredSource: normalizeExecutionLogMode(input.executionLog) === 'never',
	});
	const fulfilled = fulfilledEscalationSymbolIds(compiled, input, resolverId);
	return {
		compiled,
		blockingDiagnostics: collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) =>
				diagnostic.severity === 'error' &&
				!(
					diagnostic.code === 'MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED' &&
					typeof diagnostic.symbolId === 'string' &&
					fulfilled.has(diagnostic.symbolId)
				),
		),
	};
}

function throwIfBlocked(
	input: Pick<TransformTsrxModuleInput, 'filename' | 'source'>,
	blockingDiagnostics: readonly CompilerDiagnostic[],
) {
	if (blockingDiagnostics.length === 0) return;
	const details = formatBlockedCompileError(input, blockingDiagnostics);
	throw new MarklessCompileError(
		createCompileErrorPayload({
			filename: input.filename,
			source: input.source,
			diagnostics: blockingDiagnostics,
			details,
		}),
	);
}

function formatBlockedCompileError(
	input: Pick<TransformTsrxModuleInput, 'filename' | 'source'>,
	diagnostics: readonly CompilerDiagnostic[],
): string {
	const summary = `MARKLESS_COMPILE_BLOCKED: ${input.filename} has ${diagnostics.length} compiler error(s).`;
	const blocks = diagnostics.map((diagnostic) => {
		const position = diagnostic.primarySpan
			? formatSourcePosition(input.source, diagnostic.primarySpan.start)
			: undefined;
		const location = position
			? ` (${diagnostic.primarySpan!.filename}:${position.line}:${position.column})`
			: '';
		return [
			`${diagnostic.code}: ${diagnostic.message}${location}`,
			diagnostic.why,
			diagnostic.suggestions[0]?.message,
			diagnostic.docsUrl,
		]
			.filter((line): line is string => Boolean(line))
			.join('\n');
	});
	return [summary, ...blocks].join('\n\n');
}

function formatSourcePosition(
	source: string,
	start: number,
): { readonly line: number; readonly column: number } {
	const sourceBeforeSpan = source.slice(0, start);
	const lastLineBreak = sourceBeforeSpan.lastIndexOf('\n');
	return {
		line: sourceBeforeSpan.split('\n').length,
		column: sourceBeforeSpan.length - lastLineBreak,
	};
}

function uniqueSymbolsById<T extends { readonly id: string }>(symbols: ReadonlyArray<T>): T[] {
	return [...new Map(symbols.map((symbol) => [symbol.id, symbol])).values()];
}

// Imported child modules were compiled before their parent edges were known, so
// their symbol code still reads the legacy prop graph cell. Bound rows carry the
// parent-proven routes; this adapter makes those reads edge-specific at load time.
function containerScopedResumeView(view: ProtocolViewPayload): ProtocolViewPayload {
	return {
		...view,
		// Match the markless/view locator table served by renderToString().
		locators: (view.locators ?? []).map((locator) => ({
			...locator,
			index: locator.index + 1,
		})),
	};
}

function needsFullResume(
	state: ProtocolStatePayload,
	_view: ProtocolViewPayload,
	runtimeDemandMap: RuntimeDemandMapArtifact,
): boolean {
	if ((state.storage?.length ?? 0) > 0) return true;
	return runtimeDemandMap.payloadRecords.some((record) =>
		RECORD_NEEDS_FULL_RESUME[record.kind](runtimeDemandMap),
	);
}

const RECORD_NEEDS_FULL_RESUME = {
	'async-boundary': () => true,
	behavior: () => false,
	branch: () => true,
	'dom-update': () => false,
	'element-handle': () => true,
	[PROTOCOL_EVENT_ACTION_KIND.event]: () => false,
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: () => false,
	'keyed-repeat': (runtimeDemandMap) => !recordKindReplaced(runtimeDemandMap, 'keyed-repeat'),
	// The overlay behaviour installs from the resume runtime's start, which no lean
	// tier reaches. A marked app on a lean tier would emit the chunk and never run
	// it, so the mark forces the tier that can honour it.
	overlay: () => true,
} satisfies Record<
	RuntimeDemandMapRecordKind,
	(runtimeDemandMap: RuntimeDemandMapArtifact) => boolean
>;

function recordKindReplaced(
	runtimeDemandMap: RuntimeDemandMapArtifact,
	kind: RuntimeDemandMapRecordKind,
): boolean {
	return runtimeDemandMap.recordKinds.some(
		(record) => record.kind === kind && record.replaced === true,
	);
}

/**
 * What the settle module must import, and what the document must carry to use
 * it. Fails closed: a boundary whose runner symbol or whose bound base symbol
 * is not in this page's symbol rows produces no settle module at all, so the
 * page keeps the self-wake path rather than half a settle.
 */
export function planSettleModule(input: {
	readonly boundaries: RenderDataArtifact['boundaries'] | undefined;
	readonly asyncRunners?: Readonly<Record<string, string>>;
	readonly descriptors?: BoundSymbolDescriptorMap;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
}):
	| {
			readonly runners: ReadonlyArray<{ readonly node: string; readonly symbol: SourceSymbolRow }>;
			readonly derives: ReadonlyArray<{ readonly id: string; readonly symbol: SourceSymbolRow }>;
			readonly bound: PrerenderSettleBoundMap;
	  }
	| undefined {
	const symbolById = new Map(input.symbols.map((symbol) => [symbol.id, symbol]));
	const runners: Array<{ node: string; symbol: SourceSymbolRow }> = [];
	const derives: Array<{ id: string; symbol: SourceSymbolRow }> = [];
	const bound: PrerenderSettleBoundMap = {};
	// No render data means no settled arms to describe, not a build failure.
	for (const boundary of input.boundaries ?? []) {
		const node = boundary.runnerGraphNodeId;
		if (!node || !boundary.protocolSupported) continue;
		const runner = symbolById.get(input.asyncRunners?.[node] ?? '');
		if (!runner) continue;
		const descriptors = input.descriptors?.[boundary.boundaryId] ?? [];
		const rows = descriptors.map((descriptor) => ({
			descriptor,
			symbol: symbolById.get(descriptor.base),
		}));
		// One unresolvable derive symbol means the arm's derived hole could never
		// be filled, so this boundary contributes nothing.
		if (rows.some((row) => !row.symbol)) continue;
		runners.push({ node, symbol: runner });
		for (const row of rows) {
			derives.push({ id: row.descriptor.id, symbol: row.symbol! });
			bound[boundary.boundaryId] = {
				...bound[boundary.boundaryId],
				[row.descriptor.id]: Object.fromEntries(
					row.descriptor.slots.map((slot) => [
						`${slot[0]}|${slot[1].join('.')}`,
						[slot[2], slot[3]] as const,
					]),
				),
			};
		}
	}
	return runners.length > 0 ? { runners, derives, bound } : undefined;
}

// A settled arm filled without the generic resolver still needs to CALL the
// child's compiled derive symbol, which reads the legacy prop cell. Each
// descriptor carries the base symbol the loader resolves plus the parent routes
// those legacy reads map onto — only for the bound symbols reachable from that
// boundary's own arm chunks, so the emission stays a boundary-sized fact.
export function perBoundaryBoundSymbolDescriptors(
	renderData: RenderDataArtifact,
	boundRows: ReadonlyArray<BoundSymbolResolverRow>,
): BoundSymbolDescriptorMap | undefined {
	if (boundRows.length === 0) return undefined;
	const chunks = new Map(renderData.chunks.map((chunk) => [chunk.id, chunk]));
	const descriptors: Record<string, ReadonlyArray<BoundSymbolDescriptor>> = {};
	for (const boundary of renderData.boundaries) {
		const edges = componentEdgesReachableFrom(chunks, boundary.armChunkIds.try);
		const rows = boundRows.filter((row) =>
			row.ancestry.some((step) => edges.has(step.componentEdgeId)),
		);
		if (rows.length === 0) continue;
		descriptors[boundary.boundaryId] = rows.map((row) => ({
			id: row.id,
			base: row.baseSymbolId,
			slots: row.captureSlots.flatMap((slot) =>
				slot.legacyGraphRead && slot.route.kind === 'graph-reference'
					? [
							[
								slot.legacyGraphRead.graphNodeId,
								slot.legacyGraphRead.path,
								slot.route.graphNodeId,
								slot.route.path,
							] as const,
						]
					: [],
			),
		}));
	}
	return Object.keys(descriptors).length > 0 ? descriptors : undefined;
}

function componentEdgesReachableFrom(
	chunks: ReadonlyMap<string, RenderDataArtifact['chunks'][number]>,
	rootChunkId: string,
): ReadonlySet<string> {
	const edges = new Set<string>();
	const pending = [rootChunkId];
	const visited = new Set<string>();
	while (pending.length > 0) {
		const id = pending.pop()!;
		if (visited.has(id)) continue;
		visited.add(id);
		for (const slot of chunks.get(id)?.slots ?? []) {
			if (slot.kind === 'child-component') {
				edges.add(slot.componentEdgeId);
				pending.push(slot.childTemplateId);
				if (slot.projectionChunkId) pending.push(slot.projectionChunkId);
			} else if (slot.kind === 'repeat') {
				pending.push(slot.rowTemplateId);
				if (slot.emptyTemplateId) pending.push(slot.emptyTemplateId);
			} else if (slot.kind === 'branch') {
				pending.push(...slot.armTemplateIds);
			}
		}
	}
	return edges;
}
