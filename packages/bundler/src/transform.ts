import {
	collectTsrxModuleDiagnostics,
	compileTsrxModule,
	emitSymbolResolverModule,
	type CompilerDiagnostic,
	type RuntimeDemandMapArtifact,
} from '@markless/compiler';
import type { ProtocolViewPayload } from '@markless/serializer';
import type {
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	emitResumeModule,
	emitSourceModule,
	payloadModule,
	resumeVirtualModuleId,
	rewriteSymbolModuleExport,
	scopedSymbolExportName,
	symbolVirtualModuleId,
} from './source-module.ts';
import { injectExecutionLogModuleHook } from './execution-log.ts';
import { compileInlineResumerSources } from './inline-resumer.ts';
import { createCompileErrorPayload, MarklessCompileError } from './dev-error/index.ts';

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

async function stripEmittedTypes(code: string): Promise<string> {
	const oxcTransformSync = await loadOxcTransformSync();
	if (!oxcTransformSync) return code;
	try {
		const out = oxcTransformSync('markless-emitted.ts', code);
		// transformSync reports failures via `errors` with empty output instead of
		// throwing (e.g. lib-mode emissions that carry authored TSRX syntax).
		if (!out.code || (out.errors?.length ?? 0) > 0) return code;
		return out.code;
	} catch {
		// Never make emission fail on the stripper; downstream diagnostics are
		// more specific about genuinely-invalid code.
		return code;
	}
}

export { MARKLESS_VIRTUAL_PREFIX, resumeVirtualModuleId } from './source-module.ts';

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	const encodedFilename = encodeURIComponent(input.filename);
	const payloadId = `${MARKLESS_VIRTUAL_PREFIX}payload:${encodedFilename}`;
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodedFilename}`;
	const resumeId = resumeVirtualModuleId(input.filename);
	const { compiled, blockingDiagnostics } = await compileWithBlockingDiagnostics(
		input,
		resolverId,
	);
	throwIfBlocked(input, blockingDiagnostics);
	const symbolRows = compiled.symbolModules.modules.map((module) => ({
		id: module.symbolId,
		chunk: symbolVirtualModuleId(input.filename, module.symbolId),
		exportName: scopedSymbolExportName(input.filename, module.exportName),
	}));
	const importedBoundRows = compiled.boundSymbolResolver.rows.map((row) =>
		row.loaderSymbolId ? { ...row, baseSymbolId: row.loaderSymbolId } : row,
	);
	const resolverSource = adaptImportedCaptureResolver(
		emitSymbolResolverModule({
			buildId: input.buildId,
			symbols: uniqueSymbolsById([...(input.symbols ?? []), ...symbolRows]),
			boundSymbols: importedBoundRows,
		}),
		importedBoundRows.some((row) => row.loaderSymbolId !== undefined),
	);
	const symbolRoutes = compiled.semanticGraph.componentEdges.flatMap((edge, index) =>
		edge.importSource
			? [{ prefix: `c${index}:`, importSource: edge.importSource, componentEdgeId: edge.id }]
			: [],
	);
	const executionLogModuleHookMode =
		input.executionLogModuleHooks === false ? 'never' : input.executionLog;
	const manifest: MarklessTransformManifest = {
		source: input.filename,
		captureMetadata: compiled.captureAnalysis,
		symbolRoutes,
		payload: { virtualModuleId: payloadId },
		resolver: { virtualModuleId: resolverId },
		symbols: compiled.symbolModules.modules.map((module, index) => ({
			symbolId: module.symbolId,
			kind: module.kind,
			exportName: symbolRows[index]!.exportName,
			virtualModuleId: symbolVirtualModuleId(input.filename, module.symbolId),
		})),
		runtimeDemandMap: compiled.runtimeDemandMap,
	};
	// Scoped <style> CSS ships through the bundler's CSS pipeline: a virtual
	// .css module imported by the transformed module, never inline JS.
	const styleScope = compiled.publicRenderPlan.styleScopes[0];
	const styleId = styleScope ? `${MARKLESS_VIRTUAL_PREFIX}style:${encodedFilename}.css` : null;
	const virtualModules: MarklessVirtualModule[] = [
		...(styleScope && styleId
			? [{ id: styleId, type: 'style' as const, source: styleScope.cssText }]
			: []),
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
				needsFullResume: needsFullResume(compiled.protocolView, compiled.runtimeDemandMap),
				hasBoundSymbols: compiled.boundSymbolResolver.rows.length > 0,
				symbols: symbolRows,
				symbolRoutes,
			}),
		},
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
	return {
		code:
			styleImport +
			(await stripEmittedTypes(
				emitSourceModule({
					filename: input.filename,
					payloadId,
					resolverId,
					environment: input.environment ?? 'lib',
					clientOutput: input.clientOutput ?? 'full',
					executionLog: input.executionLog,
					headInjections: headInjections.length > 0 ? headInjections : undefined,
					inlineResumerSources,
					devResumeReexport: input.devResumeReexport === true,
					needsFullResume: needsFullResume(
						compiled.protocolView,
						compiled.runtimeDemandMap,
					),
					resumeModuleUrl: input.resumeModuleUrl,
					publicRenderModuleSource: compiled.publicRenderModule.moduleSource,
					publicRenderRootExportName: compiled.publicRenderModule.rootExportName,
					publicCsrModuleSource: compiled.publicRenderModule.csrModuleSource,
					publicRenderCsrExportName: compiled.publicRenderModule.csrExportName,
					publicSsrModuleSource: compiled.publicRenderModule.ssrModuleSource,
					publicRenderSsrExportName: compiled.publicRenderModule.ssrExportName,
					hasBoundSymbols: compiled.boundSymbolResolver.rows.length > 0,
					symbols: symbolRows,
					symbolRoutes,
				}),
			)),
		map: null,
		virtualModules,
		manifest,
	};
}

export async function preflightTsrxModuleDiagnostics(
	input: Pick<TransformTsrxModuleInput, 'filename' | 'source' | 'buildId'>,
): Promise<void> {
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodeURIComponent(input.filename)}`;
	const { blockingDiagnostics } = await compileWithBlockingDiagnostics(input, resolverId);
	throwIfBlocked(input, blockingDiagnostics);
}

async function compileWithBlockingDiagnostics(
	input: Pick<TransformTsrxModuleInput, 'filename' | 'source' | 'buildId' | 'symbols'>,
	resolverId: string,
) {
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		buildId: input.buildId,
		resolverId,
		symbols: input.symbols ?? [],
	});
	return {
		compiled,
		blockingDiagnostics: collectTsrxModuleDiagnostics(compiled).filter(
			(diagnostic) => diagnostic.severity === 'error',
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
function adaptImportedCaptureResolver(source: string, hasImportedRows: boolean): string {
	if (!hasImportedRows) return source;
	const original =
		'\treturn (context) => base({ ...context, capture: createCaptureContext(context, bound) });';
	const replacement = [
		'\treturn async (context) => {',
		'\t\tconst pendingCallbacks = [];',
		'\t\tconst capture = createCaptureContext(context, bound);',
		'\t\tconst result = await base({ ...context, graph: createBoundGraph(context, bound, capture, pendingCallbacks), capture });',
		'\t\tawait Promise.all(pendingCallbacks);',
		'\t\treturn result;',
		'\t};',
	].join('\n');
	const helper = [
		'function createBoundGraph(context, bound, capture, pendingCallbacks) {',
		'\tconst legacySlots = new Map(bound.captureSlots.flatMap((slot) => slot.legacyGraphRead ? [[JSON.stringify([slot.legacyGraphRead.graphNodeId, slot.legacyGraphRead.path]), slot]] : []));',
		'\treturn {',
		'\t\t...context.graph,',
		'\t\tread(graphNodeId, path = []) {',
		'\t\t\tconst slot = legacySlots.get(JSON.stringify([graphNodeId, path]));',
		'\t\t\tif (!slot) return context.graph.read(graphNodeId, path);',
		'\t\t\tif (slot.route.kind === "callback-route") return (...args) => {',
		'\t\t\t\tconst pending = context.invokeSymbol(slot.route.callbackSymbolId, { ...context, event: context.event, args });',
		'\t\t\t\tpendingCallbacks.push(Promise.resolve(pending));',
		'\t\t\t\treturn pending;',
		'\t\t\t};',
		'\t\t\treturn capture.read(slot.slotId);',
		'\t\t},',
		'\t};',
		'}',
		'',
	].join('\n');
	return source
		.replace(original, replacement)
		.replace(
			'function createCaptureContext(context, bound) {',
			`${helper}function createCaptureContext(context, bound) {`,
		);
}

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
	view: ProtocolViewPayload,
	runtimeDemandMap: RuntimeDemandMapArtifact,
): boolean {
	if ((view.branches?.length ?? 0) > 0) return true;
	if ((view.elementHandles?.length ?? 0) > 0) return true;
	if ((view.asyncBoundaries?.length ?? 0) > 0) return true;
	if ((view.keyedRepeats?.length ?? 0) === 0) return false;
	return !recordKindReplaced(runtimeDemandMap, 'keyed-repeat');
}

function recordKindReplaced(runtimeDemandMap: RuntimeDemandMapArtifact, kind: string): boolean {
	return runtimeDemandMap.recordKinds.some(
		(record) => record.kind === kind && record.replaced === true,
	);
}
