import {
	compileTsrxModule,
	emitSymbolResolverModule,
} from '@arcade/compiler';
import type {
	ArcadeTransformManifest,
	ArcadeVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';
import {
	ARCADE_VIRTUAL_PREFIX,
	emitSourceModule,
	payloadModule,
	rewriteSymbolModuleExport,
	scopedSymbolExportName,
	symbolVirtualModuleId,
} from './source-module.ts';

export { ARCADE_VIRTUAL_PREFIX } from './source-module.ts';

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	const encodedFilename = encodeURIComponent(input.filename);
	const payloadId = `${ARCADE_VIRTUAL_PREFIX}payload:${encodedFilename}`;
	const resolverId = `${ARCADE_VIRTUAL_PREFIX}resolver:${encodedFilename}`;
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
		edge.importSource
			? [{ prefix: `c${index}:`, importSource: edge.importSource }]
			: [],
	);
	const manifest: ArcadeTransformManifest = {
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
	const virtualModules: ArcadeVirtualModule[] = [
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
			(module, index): ArcadeVirtualModule => ({
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

	return {
		code: emitSourceModule({
			filename: input.filename,
			payloadId,
			resolverId,
			environment: input.environment ?? 'lib',
			clientOutput: input.clientOutput ?? 'full',
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
