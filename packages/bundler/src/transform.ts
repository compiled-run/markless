import { compileTsrxModule, emitSymbolResolverModule } from '@arcade/compiler';
import type {
	ArcadeTransformManifest,
	ArcadeVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

export const ARCADE_VIRTUAL_PREFIX = 'virtual:arcade:';

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
	const symbolModules = compiled.symbolModules.modules.map((module) => ({
		...module,
		virtualModuleId: symbolVirtualModuleId(input.filename, module.symbolId),
	}));
	const symbolRuntimeUrl =
		input.symbolRuntimeUrl ?? ((virtualModuleId: string) => virtualModuleId);
	const symbolRows = symbolModules.map((module) => ({
		id: module.symbolId,
		chunk: symbolRuntimeUrl(module.virtualModuleId),
		exportName: module.exportName,
	}));
	const resolverSource = emitSymbolResolverModule({
		buildId: input.buildId,
		symbols: symbolRows,
	});
	const manifest: ArcadeTransformManifest = {
		source: input.filename,
		payload: { virtualModuleId: payloadId },
		resolver: { virtualModuleId: resolverId },
		symbols: symbolModules.map((module) => ({
			symbolId: module.symbolId,
			kind: module.kind,
			exportName: module.exportName,
			virtualModuleId: module.virtualModuleId,
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
		...symbolModules.map(
			(module): ArcadeVirtualModule => ({
				id: module.virtualModuleId,
				type: 'symbol',
				symbolId: module.symbolId,
				exportName: module.exportName,
				source: module.source,
			}),
		),
	];

	return {
		code: emitSourceModule({
			filename: input.filename,
			payloadId,
			resolverId,
		}),
		map: null,
		virtualModules,
		manifest,
	};
}

function symbolVirtualModuleId(filename: string, symbolId: string) {
	return `${ARCADE_VIRTUAL_PREFIX}symbol:${encodeURIComponent(filename)}:${encodeURIComponent(symbolId)}`;
}

function payloadModule(payloadScripts: {
	readonly state: unknown;
	readonly view: unknown;
	readonly stateScript: string;
	readonly viewScript: string;
}) {
	return [
		`export const state = ${JSON.stringify(payloadScripts.state, null, '\t')};`,
		`export const view = ${JSON.stringify(payloadScripts.view, null, '\t')};`,
		`export const stateScript = ${JSON.stringify(payloadScripts.stateScript)};`,
		`export const viewScript = ${JSON.stringify(payloadScripts.viewScript)};`,
		'export const payloadScripts = {',
		'	state,',
		'	view,',
		'	stateScript,',
		'	viewScript,',
		'};',
		'export default payloadScripts;',
		'',
	].join('\n');
}

function emitSourceModule(input: {
	readonly filename: string;
	readonly payloadId: string;
	readonly resolverId: string;
}) {
	return [
		`import payloadScripts, { state as payloadState, view as payloadView } from '${input.payloadId}';`,
		`import { loadSymbol, symbolManifest } from '${input.resolverId}';`,
		'',
		`export const arcadeSource = ${JSON.stringify(input.filename)};`,
		'export { loadSymbol, payloadScripts, payloadState, payloadView, symbolManifest };',
		'',
		'export default {',
		'	source: arcadeSource,',
		'};',
		'',
	].join('\n');
}
