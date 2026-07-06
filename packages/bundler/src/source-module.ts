import type { MarklessClientOutput, MarklessEnvironment } from './types.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from './execution-log.ts';
import type { MarklessExecutionLogMode } from './types.ts';

export const MARKLESS_VIRTUAL_PREFIX = 'virtual:markless:';

const SMALL_SYMBOL_DIRECT_LOAD_LIMIT = 8;

export type SourceSymbolRow = {
	readonly id: string;
	readonly chunk: string;
	readonly exportName: string;
};

export type SourceSymbolRoute = {
	readonly prefix: string;
	readonly importSource: string;
};

export function symbolVirtualModuleId(filename: string, symbolId: string) {
	return `${MARKLESS_VIRTUAL_PREFIX}symbol:${encodeURIComponent(filename)}:${encodeURIComponent(symbolId)}`;
}

export function resumeVirtualModuleId(filename: string) {
	return `${MARKLESS_VIRTUAL_PREFIX}resume:${encodeURIComponent(filename)}`;
}

export function scopedSymbolExportName(filename: string, exportName: string) {
	return `${exportName}_${stringHash(filename)}`;
}

export function rewriteSymbolModuleExport(
	source: string,
	fromExportName: string,
	toExportName: string,
) {
	return source.replace(`export function ${fromExportName}`, `export function ${toExportName}`);
}

export function payloadModule(payload: {
	readonly state: unknown;
	readonly runtimeDemandMap?: unknown;
	readonly view: unknown;
}) {
	return [
		`export const state = ${JSON.stringify(payload.state, null, '\t')};`,
		`export const runtimeDemandMap = ${JSON.stringify(payload.runtimeDemandMap, null, '\t')};`,
		`export const view = ${JSON.stringify(payload.view, null, '\t')};`,
		'',
	].join('\n');
}

export function emitSourceModule(input: {
	readonly filename: string;
	readonly payloadId: string;
	readonly resolverId: string;
	readonly environment: MarklessEnvironment;
	readonly clientOutput: MarklessClientOutput;
	readonly resumeModuleUrl?: string;
	readonly headInjections?: ReadonlyArray<{
		readonly tag: string;
		readonly attributes?: Record<string, string>;
		readonly children?: string;
		readonly location: 'head' | 'body';
	}>;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly needsFullResume?: boolean;
	readonly devResumeReexport?: boolean;
	readonly publicRenderModuleSource: string;
	readonly publicRenderRootExportName: string | null;
	readonly publicCsrModuleSource: string;
	readonly publicRenderCsrExportName: string | null;
	readonly publicSsrModuleSource: string;
	readonly publicRenderSsrExportName: string | null;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
}) {
	const symbolsOnly = input.environment === 'client' && input.clientOutput === 'symbols-only';
	const routeSymbols = input.environment === 'client' && input.symbolRoutes.length > 0;
	return [
		symbolsOnly
			? ''
			: `import { state as payloadState, view as payloadView, runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		'',
		emitLoadSymbol(input),
		input.environment === 'client' && input.executionLog !== 'never' ? emitExecutionLogLoader() : '',
		routeSymbols ? 'const marklessLoadLocalSymbol = loadSymbol;' : '',
		symbolsOnly && !routeSymbols ? 'export { loadSymbol };' : '',
		symbolsOnly ? '' : 'export { payloadView };',
		symbolsOnly ? '' : 'export { payloadRuntimeDemandMap };',
		// Dev only: re-export the resume entry from the virtual resume module so the
		// inline resumer can import THIS source module (keeping the .tsrx in the client
		// module graph — vite's no-accepting-boundary full-reload depends on it).
		// Production never emits this edge: CSR builds must not reach resume code.
		// (emitted in every client variant incl. symbols-only — the inline resumer's
		// dev resumeModuleUrl points here and expects the resume entry.)
		input.devResumeReexport && input.environment === 'client'
			? `export { resumeContainerEvent } from '${resumeVirtualModuleId(input.filename)}';`
			: '',
		'',
		input.environment === 'server' || symbolsOnly ? '' : input.publicRenderModuleSource,
		input.environment === 'server' || symbolsOnly ? '' : input.publicCsrModuleSource,
		input.environment === 'client' ? '' : input.publicSsrModuleSource,
		routeSymbols
			? emitLazySymbolRouteFunction(
					input.symbolRoutes,
					'marklessSsrLoadSymbolRoute',
					'marklessLoadLocalSymbol',
				)
			: '',
		symbolsOnly && routeSymbols ? 'export { marklessSsrLoadSymbolRoute as loadSymbol };' : '',
		symbolsOnly
			? ''
			: emitCompiledAppDefault({
					environment: input.environment,
					executionLog: input.executionLog,
					headInjections: input.headInjections,
					resumeModuleUrl: input.resumeModuleUrl,
					rootExportName: input.publicRenderRootExportName,
					csrExportName: input.publicRenderCsrExportName,
					ssrExportName: input.publicRenderSsrExportName,
				}),
		'',
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

export function emitResumeModule(input: {
	readonly resolverId: string;
	readonly needsFullResume?: boolean;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
	readonly executionLog?: MarklessExecutionLogMode;
}) {
	const routeSymbols = input.symbolRoutes.length > 0;
	const resumeSymbolLoader = routeSymbols ? 'marklessSsrLoadSymbolRoute' : 'loadSymbol';
	return [
		input.executionLog === 'never' ? '' : emitExecutionLogLoader(),
		'',
		emitLoadSymbol(input),
		routeSymbols ? 'const marklessLoadLocalSymbol = loadSymbol;' : '',
		routeSymbols
			? emitLazySymbolRouteFunction(
					input.symbolRoutes,
					'marklessSsrLoadSymbolRoute',
					'marklessLoadLocalSymbol',
				)
			: '',
		routeSymbols ? 'export { marklessSsrLoadSymbolRoute as loadSymbol };' : '',
		emitResumeContainerEvent(resumeSymbolLoader, input.needsFullResume ?? false),
		'',
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

function emitLazySymbolRouteFunction(
	routes: ReadonlyArray<SourceSymbolRoute>,
	functionName: string,
	fallbackName = 'loadSymbol',
): string {
	if (routes.length === 0) return '';
	return [
		`function ${functionName}(symbolId) {`,
		...routes.flatMap((route) => [
			`	if (symbolId.startsWith(${JSON.stringify(route.prefix)})) {`,
			`		return import(${JSON.stringify(symbolRouteImportSource(route.importSource))}).then((mod) => mod.loadSymbol ? mod.loadSymbol(symbolId.slice(${route.prefix.length})) : Promise.reject(new Error(\`Unknown child async symbol \${symbolId}\`)));`,
			'	}',
		]),
		`	return ${fallbackName}(symbolId);`,
		'}',
	].join('\n');
}

function symbolRouteImportSource(importSource: string): string {
	return importSource.includes('?')
		? `${importSource}&markless-symbols`
		: `${importSource}?markless-symbols`;
}

function emitCompiledAppDefault(input: {
	readonly environment: MarklessEnvironment;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly headInjections?: ReadonlyArray<{
		readonly tag: string;
		readonly attributes?: Record<string, string>;
		readonly children?: string;
		readonly location: 'head' | 'body';
	}>;
	readonly resumeModuleUrl?: string;
	readonly rootExportName: string | null;
	readonly csrExportName: string | null;
	readonly ssrExportName: string | null;
}): string {
	const renderCsrEntry =
		(input.rootExportName || input.csrExportName) && input.environment !== 'server'
			? [`	renderCsr: ${input.rootExportName ?? input.csrExportName},`]
			: [];
	const renderSsrEntry =
		input.ssrExportName && input.environment !== 'client'
			? ['	renderSsr(props) {', `		return ${input.ssrExportName}(props);`, '	},']
			: [];
	const resumeModuleEntry =
		input.resumeModuleUrl && input.environment !== 'client'
			? [`	resumeModuleUrl: ${JSON.stringify(input.resumeModuleUrl)},`]
			: [];
	const headInjectionEntry =
		input.headInjections?.length && input.environment !== 'client'
			? [`	headInjections: ${JSON.stringify(input.headInjections)},`]
			: [];
	const modulePreloadEntry =
		input.resumeModuleUrl && input.environment === 'server'
			? [
					`	modulePreloads: [{ href: ${JSON.stringify(input.resumeModuleUrl)}, fetchPriority: "high" }],`,
				]
			: [];
	const metadataEntries =
		input.environment === 'client'
			? []
			: [
					...headInjectionEntry,
					...resumeModuleEntry,
					...modulePreloadEntry,
					input.executionLog && input.executionLog !== 'never'
						? `	executionLog: ${JSON.stringify(input.executionLog)},`
						: '',
					'	payloadView,',
				];

	return [
		'const marklessCompiledApp = {',
		...renderCsrEntry,
		...renderSsrEntry,
		...metadataEntries,
		'};',
		'export default marklessCompiledApp;',
	].join('\n');
}

function emitResumeContainerEvent(loadSymbolName: string, needsFullResume: boolean): string {
	const fullResumeHandoff = [
		'async function marklessFullResumeHandoff(handoff) {',
		'	handoff.root.__asyncResumeRuntimeStarted = true;',
		"	const { resumeFromPayloadDocument } = await import('@markless/core/web/resume');",
		'	const { runtime } = await resumeFromPayloadDocument({',
		'		document: handoff.document,',
		'		root: handoff.root,',
		`		loadSymbol: ${loadSymbolName},`,
		'	});',
		'	await runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: true });',
		'}',
	].join('\n');
	if (needsFullResume) {
		// Branch flips need graph subscriptions and range replacement: start the
		// full resume runtime once, mark the container so the inline resumer
		// steps aside, and dispatch the pending event through the runtime.
		return [
			fullResumeHandoff,
			'export async function resumeContainerEvent(input) {',
			'	await marklessFullResumeHandoff({ ...input, document: input.root });',
			'}',
		].join('\n');
	}
	return [
		'export async function resumeContainerEvent(input) {',
		"	const { resumeEventOnlyFromPayloadDocument } = await import('@markless/core/web/event-only-resume');",
		'	await resumeEventOnlyFromPayloadDocument({',
		'		document: input.root,',
		'		root: input.root,',
		'		event: input.event,',
		'		element: input.element,',
		'		eventRecord: input.eventRecord,',
		'		syncPolicyAlreadyApplied: !!input.eventRecord,',
		`		loadSymbol: ${loadSymbolName},`,
		'	});',
		'}',
	].join('\n');
}

function emitExecutionLogLoader(): string {
	return `globalThis.__mxLoadLog ||= () => import(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});`;
}

function emitLoadSymbol(input: {
	readonly resolverId: string;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
}) {
	if (input.symbols.length > 0 && input.symbols.length <= SMALL_SYMBOL_DIRECT_LOAD_LIMIT) {
		return emitDirectSourceSymbolLoader(input.symbols);
	}

	return [
		`const marklessSymbolResolverModule = () => import('${input.resolverId}');`,
		'function loadSymbol(symbolId) {',
		'	return marklessSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
		'}',
	].join('\n');
}

function emitDirectSourceSymbolLoader(symbols: ReadonlyArray<SourceSymbolRow>): string {
	return [
		'function loadSymbol(symbolId) {',
		...symbols.flatMap((symbol) => [
			`	if (symbolId === ${JSON.stringify(symbol.id)}) return import('${symbol.chunk}')`,
			`		.then((mod) => readMarklessSourceSymbol(mod, ${JSON.stringify(symbol.exportName)}));`,
		]),
		'	return Promise.reject(new Error(`Unknown async symbol ${symbolId}`));',
		'}',
		emitSourceSymbolExportReader(),
	].join('\n');
}

function emitSourceSymbolExportReader(): string {
	return [
		'function readMarklessSourceSymbol(mod, exportName) {',
		'	mod.init__virtual_markless_symbol?.();',
		'	return mod[exportName];',
		'}',
	].join('\n');
}

function stringHash(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}
