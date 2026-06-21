import {
	compileTsrxModule,
	createSymbolResolverModuleManifest,
	emitSymbolResolverModule,
} from '@arcade/compiler';
import type {
	ArcadeTransformManifest,
	ArcadeVirtualModule,
	TransformTsrxModuleInput,
	TransformTsrxModuleResult,
} from './types.ts';

export const ARCADE_VIRTUAL_PREFIX = 'virtual:arcade:';
const SMALL_SYMBOL_DIRECT_LOAD_LIMIT = 8;

type SourceSymbolRow = {
	readonly id: string;
	readonly chunk: string;
	readonly exportName: string;
};

export async function transformTsrxModule(
	input: TransformTsrxModuleInput,
): Promise<TransformTsrxModuleResult> {
	const encodedFilename = encodeURIComponent(input.filename);
	const payloadId = `${ARCADE_VIRTUAL_PREFIX}payload:${encodedFilename}`;
	const resolverId = `${ARCADE_VIRTUAL_PREFIX}resolver:${encodedFilename}`;
	const moduleManifestId = `${ARCADE_VIRTUAL_PREFIX}module-manifest:${encodedFilename}`;
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
		exportName: module.exportName,
	}));
	const resolverSource = emitSymbolResolverModule({
		buildId: input.buildId,
		symbols: symbolRows,
	});
	const resolverManifest = createSymbolResolverModuleManifest({
		buildId: input.buildId,
		symbols: symbolRows,
	});
	const manifest: ArcadeTransformManifest = {
		source: input.filename,
		payload: { virtualModuleId: payloadId },
		resolver: { virtualModuleId: resolverId },
		moduleManifest: { virtualModuleId: moduleManifestId },
		symbols: compiled.symbolModules.modules.map((module) => ({
			symbolId: module.symbolId,
			kind: module.kind,
			exportName: module.exportName,
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
		{
			id: moduleManifestId,
			type: 'module-manifest',
			source: objectModule({
				...manifest,
				resolverManifest,
			}),
		},
		...compiled.symbolModules.modules.map(
			(module): ArcadeVirtualModule => ({
				id: symbolVirtualModuleId(input.filename, module.symbolId),
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
			resolverManifest,
			moduleManifestId,
			publicRenderModuleSource: compiled.publicRenderModule.moduleSource,
			symbols: symbolRows,
		}),
		map: null,
		virtualModules,
		manifest,
	};
}

function symbolVirtualModuleId(filename: string, symbolId: string) {
	return `${ARCADE_VIRTUAL_PREFIX}symbol:${encodeURIComponent(filename)}:${encodeURIComponent(symbolId)}`;
}

function objectModule(value: unknown) {
	return `export default ${JSON.stringify(value, null, '\t')};\n`;
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
	readonly resolverManifest: unknown;
	readonly moduleManifestId: string;
	readonly publicRenderModuleSource: string;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
}) {
	return [
		`import payloadScripts, { state as payloadState, view as payloadView } from '${input.payloadId}';`,
		`import moduleManifest from '${input.moduleManifestId}';`,
		'',
		`export const arcadeSource = ${JSON.stringify(input.filename)};`,
		`const symbolManifest = ${JSON.stringify(input.resolverManifest)};`,
		emitLoadSymbol(input),
		'export { loadSymbol, moduleManifest, payloadScripts, payloadState, payloadView, symbolManifest };',
		'',
		'export default {',
		'	source: arcadeSource,',
		'	payloadScripts,',
		'	payloadState,',
		'	payloadView,',
		'	loadSymbol,',
		'	symbolManifest,',
		'	moduleManifest,',
		'};',
		input.publicRenderModuleSource,
		'',
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

function emitLoadSymbol(input: {
	readonly resolverId: string;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
}) {
	if (input.symbols.length > 0 && input.symbols.length <= SMALL_SYMBOL_DIRECT_LOAD_LIMIT) {
		return emitDirectSourceSymbolLoader(input.symbols);
	}

	return [
		`const arcadeSymbolResolverModule = () => import('${input.resolverId}');`,
		'function loadSymbol(symbolId) {',
		'	return arcadeSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
		'}',
	].join('\n');
}

function emitDirectSourceSymbolLoader(symbols: ReadonlyArray<SourceSymbolRow>): string {
	return [
		'function loadSymbol(symbolId) {',
		...symbols.flatMap((symbol) => [
			`	if (symbolId === ${JSON.stringify(symbol.id)}) return import('${symbol.chunk}')`,
			`		.then((mod) => readArcadeSourceSymbol(mod, ${JSON.stringify(symbol.exportName)}));`,
		]),
		'	return Promise.reject(new Error(`Unknown async symbol ${symbolId}`));',
		'}',
		emitSourceSymbolExportReader(),
	].join('\n');
}

function emitSourceSymbolExportReader(): string {
	return [
		'function readArcadeSourceSymbol(mod, exportName) {',
		'	mod.init__virtual_arcade_symbol?.();',
		'	return mod[exportName];',
		'}',
	].join('\n');
}
