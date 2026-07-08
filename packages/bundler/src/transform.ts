import {
	compileTsrxModule,
	emitSymbolResolverModule,
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
	const compiled = await compileTsrxModule({
		filename: input.filename,
		source: input.source,
		buildId: input.buildId,
		resolverId,
		symbols: [],
	});
	const symbolRows = compiled.symbolModules.modules.map((module) => ({
		id: module.symbolId,
		chunk: symbolVirtualModuleId(input.filename, module.symbolId),
		exportName: scopedSymbolExportName(input.filename, module.exportName),
	}));
	const resolverSource = emitSymbolResolverModule({
		buildId: input.buildId,
		symbols: symbolRows,
	});
	const symbolRoutes = compiled.semanticGraph.componentEdges.flatMap((edge, index) =>
		edge.importSource ? [{ prefix: `c${index}:`, importSource: edge.importSource }] : [],
	);
	const executionLogModuleHookMode =
		input.executionLogModuleHooks === false ? 'never' : input.executionLog;
	const manifest: MarklessTransformManifest = {
		source: input.filename,
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
					headInjections: input.headInjections,
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
					symbols: symbolRows,
					symbolRoutes,
				}),
			)),
		map: null,
		virtualModules,
		manifest,
	};
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
