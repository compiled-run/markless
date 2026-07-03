import { compileTsrxModule, emitSymbolResolverModule } from '@markless/compiler';
import type {
	MarklessTransformManifest,
	MarklessVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
import {
	MARKLESS_VIRTUAL_PREFIX,
	emitSourceModule,
	payloadModule,
	rewriteSymbolModuleExport,
	scopedSymbolExportName,
	symbolVirtualModuleId,
} from './source-module.ts';

export { MARKLESS_VIRTUAL_PREFIX } from './source-module.ts';

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	const encodedFilename = encodeURIComponent(input.filename);
	const payloadId = `${MARKLESS_VIRTUAL_PREFIX}payload:${encodedFilename}`;
	const resolverId = `${MARKLESS_VIRTUAL_PREFIX}resolver:${encodedFilename}`;
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
			source: payloadModule(compiled.payloadScripts),
		},
		{
			id: resolverId,
			type: 'resolver',
			source: resolverSource,
		},
		...compiled.symbolModules.modules.map(
			(module, index): MarklessVirtualModule => ({
				id: symbolVirtualModuleId(input.filename, module.symbolId),
				type: 'symbol',
				symbolId: module.symbolId,
				exportName: symbolRows[index]!.exportName,
				source: rewriteSymbolModuleExport(
					module.source,
					module.exportName,
					symbolRows[index]!.exportName,
				),
			}),
		),
	];

	const styleImport = styleId ? `import ${JSON.stringify(styleId)};\n` : '';
	return {
		code:
			styleImport +
			emitSourceModule({
				filename: input.filename,
				payloadId,
				resolverId,
				environment: input.environment ?? 'lib',
				clientOutput: input.clientOutput ?? 'full',
				needsFullResume:
					(compiled.protocolView.branches?.length ?? 0) > 0 ||
					(compiled.protocolView.keyedRepeats?.length ?? 0) > 0,
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
		map: null,
		virtualModules,
		manifest,
	};
}
