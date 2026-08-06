import type { MarklessClientOutput, MarklessEnvironment } from './types.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from './execution-log.ts';
import type { MarklessExecutionLogMode } from './types.ts';
import type {
	InlineResumerSourceVariants,
	PrerenderBootArtifact,
} from '@markless/web/inline/resumer';
import type { StorageSeedMetadata } from '@markless/serializer';
import { ASYNC_PROTOCOL_VERSION } from '@markless/serializer';

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

/**
 * What a settle path needs to call ONE bound symbol without the generic
 * resolver: the base symbol the loader resolves, and the legacy prop reads the
 * child's compiled code performs, each paired with the parent route that
 * answers it. `slots` entries are `[readNode, readPath, routeNode, routePath]`
 * — positional because this ships in the emitted module and every key costs
 * document bytes.
 */
export type BoundSymbolDescriptor = {
	readonly id: string;
	readonly base: string;
	readonly slots: ReadonlyArray<
		readonly [string, ReadonlyArray<string>, string, ReadonlyArray<string>]
	>;
};

export type BoundSymbolDescriptorMap = Readonly<
	Record<string, ReadonlyArray<BoundSymbolDescriptor>>
>;

export const MARKLESS_BOUND_SYMBOLS_EXPORT = 'marklessBoundSymbols';

const SYMBOL_VIRTUAL_PREFIX = `${MARKLESS_VIRTUAL_PREFIX}symbol:`;

export function symbolVirtualModuleId(filename: string, symbolId: string) {
	return `${SYMBOL_VIRTUAL_PREFIX}${encodeURIComponent(filename)}:${encodeURIComponent(symbolId)}`;
}

export function encodedSymbolSource(filename: string): string {
	return encodeURIComponent(filename);
}

// Single source of truth for reading a symbol virtual module id back. Build
// tooling (the bundler's resolve hooks, the router's route preload planning)
// recovers the source file a symbol module serves from the id; symbol chunks
// are otherwise invisible in the bundle graph because the symbol resolver
// demands them through a computed import table, not literal import edges.
// Returns the decoded source filename, or null when the id is not a symbol
// virtual module id. Accepts rolldown-resolved ids (leading `\0`).
export function symbolVirtualModuleSourceFile(moduleId: string): string | null {
	const bare = moduleId.startsWith('\0') ? moduleId.slice(1) : moduleId;
	if (!bare.startsWith(SYMBOL_VIRTUAL_PREFIX)) return null;
	const encoded = bare.slice(SYMBOL_VIRTUAL_PREFIX.length);
	const separator = encoded.indexOf(':');
	if (separator <= 0 || separator === encoded.length - 1) return null;
	if (encoded.includes(':', separator + 1)) return null;
	try {
		return decodeURIComponent(encoded.slice(0, separator));
	} catch {
		return null;
	}
}

export function resumeVirtualModuleId(filename: string) {
	return `${MARKLESS_VIRTUAL_PREFIX}resume:${encodeURIComponent(filename)}`;
}

export function prerenderWakeVirtualModuleId(filename: string) {
	return `${MARKLESS_VIRTUAL_PREFIX}prerender-wake:${encodeURIComponent(filename)}`;
}

export function settleVirtualModuleId(filename: string) {
	return `${MARKLESS_VIRTUAL_PREFIX}settle:${encodeURIComponent(filename)}`;
}

/**
 * The settle module: import targets and data, no logic. It carries the DOM
 * filler, each boundary's async runner keyed by graph node, and each bound
 * symbol's compiled derive function keyed by the id the fill plan references.
 * Rolldown resolves the real chunk urls, so nothing here is a url the document
 * has to carry, and a page that never settles an arm never loads it.
 */
export function emitSettleModule(input: {
	readonly runners: ReadonlyArray<{ readonly node: string; readonly symbol: SourceSymbolRow }>;
	readonly derives: ReadonlyArray<{ readonly id: string; readonly symbol: SourceSymbolRow }>;
}): string {
	const imports = [...input.runners, ...input.derives].map((entry) => entry.symbol);
	const seen = new Map<string, string>();
	const lines: string[] = ["export { marklessApplySettlePlan as f } from '@markless/web/fns/settle-plan';"];
	for (const symbol of imports) {
		if (seen.has(symbol.id)) continue;
		seen.set(symbol.id, symbol.exportName);
		lines.push(`import { ${symbol.exportName} } from ${JSON.stringify(symbol.chunk)};`);
	}
	const entries = (rows: ReadonlyArray<{ readonly key: string; readonly symbolId: string }>) =>
		`{${rows.map((row) => `${JSON.stringify(row.key)}: ${seen.get(row.symbolId)}`).join(',')}}`;
	lines.push(
		`export const r = ${entries(input.runners.map((entry) => ({ key: entry.node, symbolId: entry.symbol.id })))};`,
	);
	lines.push(
		`export const d = ${entries(input.derives.map((entry) => ({ key: entry.id, symbolId: entry.symbol.id })))};`,
	);
	return `${lines.join('\n')}\n`;
}

export function prerenderWakeVirtualModuleSourceFile(moduleId: string): string | null {
	const bare = moduleId.startsWith('\0') ? moduleId.slice(1) : moduleId;
	const prefix = `${MARKLESS_VIRTUAL_PREFIX}prerender-wake:`;
	if (!bare.startsWith(prefix)) return null;
	try {
		return decodeURIComponent(bare.slice(prefix.length));
	} catch {
		return null;
	}
}

export function scopedSymbolExportName(filename: string, exportName: string) {
	return `${exportName}_${stringHash(filename)}`;
}

export function rewriteSymbolModuleExport(
	source: string,
	fromExportName: string,
	toExportName: string,
) {
	// Handlers with await bodies emit `export async function` — rename both forms.
	return source
		.replace(`export function ${fromExportName}`, `export function ${toExportName}`)
		.replace(
			`export async function ${fromExportName}`,
			`export async function ${toExportName}`,
		);
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

function emitPublicRenderModule(
	source: string,
	input: { readonly executionLogEnabled: boolean; readonly rootExportName: string | null },
): string {
	if (!input.executionLogEnabled || !input.rootExportName) return source;
	const declaration = `export function ${input.rootExportName}()`;
	if (!source.includes(declaration)) return source;
	const implementationName = `marklessRender${input.rootExportName}`;
	return [
		source.replace(declaration, `function ${implementationName}()`),
		`export function ${input.rootExportName}() {`,
		`\tconst output = ${implementationName}();`,
		'\tglobalThis.__mxLoadLog().then(log => log.logMarklessRenderSummary());',
		'\treturn output;',
		'}',
	].join('\n');
}

export function emitSourceModule(input: {
	readonly filename: string;
	readonly payloadId: string;
	readonly resolverId: string;
	readonly environment: MarklessEnvironment;
	readonly clientOutput: MarklessClientOutput;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
	readonly headInjections?: ReadonlyArray<{
		readonly tag: string;
		readonly attributes?: Record<string, string>;
		readonly children?: string;
		readonly location: 'head' | 'body';
	}>;
	readonly storageSeeds?: ReadonlyArray<StorageSeedMetadata>;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly inlineResumerSources?: InlineResumerSourceVariants;
	readonly prerenderBoot?: PrerenderBootArtifact;
	readonly needsFullResume?: boolean;
	readonly dev?: boolean;
	readonly devResumeReexport?: boolean;
	readonly publicRenderModuleSource: string;
	readonly publicRenderRootExportName: string | null;
	readonly publicSsrModuleSource: string;
	readonly publicRenderSsrExportName: string | null;
	readonly renderDataId?: string;
	readonly canonicalRenderData?: boolean;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly behaviorSymbols?: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
	readonly hasBoundSymbols?: boolean;
	readonly prerenderRecords?: boolean;
	readonly directCsr?: boolean;
}) {
	if (input.directCsr && input.prerenderRecords) input = { ...input, prerenderRecords: false };
	const symbolsOnly = input.environment === 'client' && input.clientOutput === 'symbols-only';
	const routeSymbols = input.environment === 'client' && input.symbolRoutes.length > 0;
	const canonicalRenderData =
		input.environment === 'client' &&
		!symbolsOnly &&
		!input.prerenderRecords &&
		input.canonicalRenderData === true &&
		input.publicRenderRootExportName === null &&
		!!input.publicSsrModuleSource &&
		!!input.renderDataId;
	return [
		(!input.publicSsrModuleSource && !input.publicRenderModuleSource) ||
		symbolsOnly ||
		!input.renderDataId ||
		(input.environment === 'client' &&
			!input.publicRenderModuleSource &&
			!input.prerenderRecords &&
			!input.dev &&
			!canonicalRenderData)
			? ''
			: canonicalRenderData
				? `import { marklessPrerenderData } from '${input.renderDataId}';`
				: `import { marklessRenderData } from '${input.renderDataId}';`,
		symbolsOnly
			? ''
			: `import { state as payloadState, view as payloadView, runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		'',
		emitLoadSymbol(input),
		input.behaviorSymbols?.length
			? emitDirectSourceSymbolLoader(
					input.behaviorSymbols,
					'readMarklessBehaviorSourceSymbol',
				).replace('function loadSymbol(', 'function loadBehaviorSymbol(')
			: '',
		input.environment === 'client' && input.executionLog !== 'never'
			? emitExecutionLogLoader()
			: '',
		routeSymbols ? 'const marklessLoadLocalSymbol = loadSymbol;' : '',
		(symbolsOnly || input.publicRenderRootExportName === null) && !routeSymbols
			? 'export { loadSymbol };'
			: '',
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
		input.environment === 'server' || symbolsOnly || input.prerenderRecords
			? ''
			: emitPublicRenderModule(input.publicRenderModuleSource, {
					executionLogEnabled: input.executionLog !== 'never',
					rootExportName: input.publicRenderRootExportName,
				}),
		input.environment === 'client' && (symbolsOnly || (!input.prerenderRecords && !input.dev))
			? ''
			: input.publicSsrModuleSource,
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
					storageSeeds: input.storageSeeds,
					inlineResumerSources: input.inlineResumerSources,
					prerenderBoot: input.prerenderBoot,
					resumeModuleUrl: input.resumeModuleUrl,
					prerenderWakeModuleUrl: input.prerenderWakeModuleUrl,
					rootExportName: input.publicRenderRootExportName,
					symbolLoaderName: routeSymbols ? 'marklessSsrLoadSymbolRoute' : 'loadSymbol',
					ssrExportName: input.publicRenderSsrExportName,
					canonicalRenderData,
					prerenderRecords: input.prerenderRecords,
					dev: input.dev,
				}),
		'',
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

export function emitResumeModule(input: {
	readonly payloadId: string;
	readonly resolverId: string;
	readonly payloadState?: unknown;
	readonly payloadView?: unknown;
	readonly runtimeDemandMap?: unknown;
	readonly needsFullResume?: boolean;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
	readonly executionLog?: MarklessExecutionLogMode;
	readonly hasBoundSymbols?: boolean;
	// Boundary-sized bound-symbol facts for the narrow settle path. Data only:
	// nothing in this module reads them, so a page that never fills an arm pays
	// their document bytes and no execution.
	readonly boundSymbolDescriptors?: BoundSymbolDescriptorMap;
	readonly prerenderDataId?: string;
	readonly installResumeSummary?: boolean;
	// The wake variant serves pages whose container carries no payload
	// scripts; lean routes read the payload document and must never emit.
	readonly recordsOnly?: boolean;
	readonly prerenderTriggerGroups?: ReadonlyArray<{
		readonly id: string;
		readonly hostNodeId: string;
		readonly eventName: string;
		readonly hostIndex: number;
		readonly hostTagName: string;
		readonly branchStartIndex?: number;
		readonly branchEndIndex?: number;
		readonly hostPath?: ReadonlyArray<number>;
		readonly moduleId: string;
	}>;
}) {
	const routeSymbols = input.symbolRoutes.length > 0;
	const resumeSymbolLoader = routeSymbols ? 'marklessSsrLoadSymbolRoute' : 'loadSymbol';
	const scalarSpecializations = scalarDispatcherSpecializations(input);
	const stagedPrerender = (input.prerenderTriggerGroups?.length ?? 0) > 0;
	const streamedResume =
		stagedPrerender ||
		((input.payloadView as { readonly asyncBoundaries?: ReadonlyArray<unknown> } | undefined)
			?.asyncBoundaries?.length ?? 0) > 0;
	// Every streamed resume module owns dispatch through the same queue. Staged
	// modules may replace the active handler, while ordinary modules remain the
	// fallback authority for interactions outside the staged closure.
	const bareResumeContainerEvent = emitResumeContainerEvent(
		resumeSymbolLoader,
		input.needsFullResume ?? false,
		(input.payloadState as { readonly version?: unknown } | undefined)?.version ===
			ASYNC_PROTOCOL_VERSION,
		input.symbolRoutes.length > 0 ? 'none' : leanResumeMode(input.runtimeDemandMap),
		scalarSpecializations,
		input.runtimeDemandMap,
		input.executionLog !== 'never',
		input.prerenderDataId,
		stagedPrerender,
	);
	const resumeContainerEvent = streamedResume
		? emitQueuedResumeContainerEvent(bareResumeContainerEvent)
		: bareResumeContainerEvent;
	return [
		input.boundSymbolDescriptors
			? `export const ${MARKLESS_BOUND_SYMBOLS_EXPORT} = ${emitBoundSymbolDescriptors(input.boundSymbolDescriptors)};`
			: null,
		input.prerenderDataId &&
		!stagedPrerender &&
		resumeContainerEvent.includes('marklessPrerenderData')
			? `import { marklessPrerenderData } from '${input.prerenderDataId}';`
			: null,
		stagedPrerender && input.prerenderDataId
			? `async function marklessLoadPrerenderData() { const module = await import('${input.prerenderDataId}'); return module.marklessPrerenderData; }`
			: null,
		`import { runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		scalarSpecializations.length > 0
			? [
					"import { marklessDecodeScalarCell, marklessReadScalarCell, marklessScalarSpecializedError } from '@markless/web/fns/scalar-specialized';",
					"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
					"import { marklessUpdateText } from '@markless/web/fns/update-text';",
				].join('\n')
			: '',
		scalarSpecializations.length > 0 || stagedPrerender
			? "import { marklessFindElementAtDomOrderIndex } from '@markless/web/fns/dom-order';"
			: '',
		'',
		input.executionLog === 'never' ? '' : emitExecutionLogLoader(),
		input.installResumeSummary && input.executionLog !== 'never'
			? 'globalThis.__mxLoadLog().then(log => log.installMarklessExecutionLog());'
			: null,
		'',
		emitLoadSymbol(input, stagedPrerender ? 'readMarklessWakeSourceSymbol' : undefined),
		routeSymbols ? 'const marklessLoadLocalSymbol = loadSymbol;' : '',
		routeSymbols
			? emitLazySymbolRouteFunction(
					input.symbolRoutes,
					'marklessSsrLoadSymbolRoute',
					'marklessLoadLocalSymbol',
				)
			: '',
		routeSymbols ? 'export { marklessSsrLoadSymbolRoute as loadSymbol };' : '',
		stagedPrerender ? emitPrerenderTriggerGroupLoader(input.prerenderTriggerGroups ?? []) : '',
		resumeContainerEvent,
		'',
	]
		.filter((line): line is string => line !== null)
		.join('\n');
}

// Key order is the compiler's boundary order, not object-literal chance, so the
// emitted bytes are identical across builds of the same source.
function emitBoundSymbolDescriptors(descriptors: BoundSymbolDescriptorMap): string {
	return JSON.stringify(
		Object.fromEntries(
			Object.keys(descriptors)
				.sort()
				.map((boundaryId) => [boundaryId, descriptors[boundaryId]]),
		),
	);
}

// Exported for witness/unit tests that synthesize demand modules: their
// synthetic resume code must flow through the same queue wrapper the real
// emission produces, never a restated copy.
export function emitQueuedResumeContainerEvent(source: string): string {
	const implementation = source.replace(
		'export async function resumeContainerEvent',
		'async function marklessResumeContainerEvent',
	);
	if (implementation === source) throw new Error('MARKLESS_RESUME_DISPATCH_EXPORT_MISSING');
	return [
		implementation,
		'export function resumeContainerEvent(input) {',
		'\tconst root = input.root;',
		'\tif (!root.__marklessDispatch) {',
		'\t\tlet handler = marklessResumeContainerEvent, tail = Promise.resolve(), lastEvent = null, lastEventTime = undefined;',
		'\t\troot.__marklessRegisterDispatch = next => {',
		'\t\t\tconst fallback = handler;',
		'\t\t\thandler = input => next(input, fallback);',
		'\t\t};',
		'\t\troot.__marklessDispatch = next => {',
		'\t\t\tconst event = next.event, eventTime = event?.timeStamp;',
		'\t\t\tif (event === lastEvent && eventTime === lastEventTime) return tail;',
		'\t\t\tlastEvent = event;',
		'\t\t\tlastEventTime = eventTime;',
		'\t\t\tconst run = () => handler(next);',
		'\t\t\treturn tail = tail.then(run, run);',
		'\t\t};',
		'\t}',
		'\treturn root.__marklessDispatch(input);',
		'}',
	].join('\n');
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
	readonly inlineResumerSources?: InlineResumerSourceVariants;
	readonly prerenderBoot?: PrerenderBootArtifact;
	readonly headInjections?: ReadonlyArray<{
		readonly tag: string;
		readonly attributes?: Record<string, string>;
		readonly children?: string;
		readonly location: 'head' | 'body';
	}>;
	readonly storageSeeds?: ReadonlyArray<StorageSeedMetadata>;
	readonly resumeModuleUrl?: string;
	readonly prerenderWakeModuleUrl?: string;
	readonly rootExportName: string | null;
	readonly symbolLoaderName: string;
	readonly ssrExportName: string | null;
	readonly canonicalRenderData: boolean;
	readonly prerenderRecords?: boolean;
	readonly dev?: boolean;
}): string {
	const renderCsrEntry =
		input.rootExportName && input.environment !== 'server' && !input.prerenderRecords
			? [`	renderCsr: ${input.rootExportName},`]
			: [];
	const symbolLoaderEntry =
		input.environment !== 'server' && input.rootExportName === null
			? [`\tloadSymbol: ${input.symbolLoaderName},`]
			: input.prerenderRecords === true
				? [`\tloadSymbol: ${input.symbolLoaderName},`]
				: [];
	const renderDataEntry = input.canonicalRenderData
		? ['\trenderData: marklessPrerenderData,']
		: [];
	// The optional render context is the per-request streaming channel (T107):
	// dropping it here would silently force every page back to blocking SSR.
	const renderSsrEntry =
		input.ssrExportName &&
		(input.environment !== 'client' || input.prerenderRecords || input.dev)
			? [
					'	renderSsr(props, marklessRenderContext) {',
					`		return ${input.ssrExportName}(props, marklessRenderContext);`,
					'	},',
				]
			: [];
	const resumeModuleEntry =
		input.resumeModuleUrl && input.environment !== 'client'
			? [`	resumeModuleUrl: ${JSON.stringify(input.resumeModuleUrl)},`]
			: [];
	const prerenderWakeModuleEntry =
		input.prerenderWakeModuleUrl && input.environment !== 'client'
			? [`\tprerenderWakeModuleUrl: ${JSON.stringify(input.prerenderWakeModuleUrl)},`]
			: [];
	const inlineResumerEntry =
		input.inlineResumerSources && input.environment !== 'client'
			? [`\tinlineResumerSources: ${JSON.stringify(input.inlineResumerSources)},`]
			: [];
	const prerenderBootEntry =
		input.prerenderBoot && input.environment !== 'client'
			? [`\tprerenderBoot: ${JSON.stringify(input.prerenderBoot)},`]
			: [];
	const headInjectionEntry =
		input.headInjections?.length && input.environment !== 'client'
			? [`	headInjections: ${JSON.stringify(input.headInjections)},`]
			: [];
	const storageSeedEntry =
		input.storageSeeds?.length && input.environment !== 'client'
			? [`\tstorageSeeds: ${JSON.stringify(input.storageSeeds)},`]
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
					...storageSeedEntry,
					...resumeModuleEntry,
					...prerenderWakeModuleEntry,
					...inlineResumerEntry,
					...prerenderBootEntry,
					...modulePreloadEntry,
					input.executionLog && input.executionLog !== 'never'
						? `	executionLog: ${JSON.stringify(input.executionLog)},`
						: '',
					'	payloadView,',
				];

	return [
		'const marklessCompiledApp = {',
		...renderCsrEntry,
		...renderDataEntry,
		...symbolLoaderEntry,
		...renderSsrEntry,
		...metadataEntries,
		'};',
		'export default marklessCompiledApp;',
	].join('\n');
}

function emitResumeContainerEvent(
	loadSymbolName: string,
	needsFullResume: boolean,
	storageFreePayload: boolean,
	leanMode: LeanResumeMode,
	scalarSpecializations: ReadonlyArray<ScalarSpecialization>,
	runtimeDemandMap: unknown,
	executionLogEnabled: boolean,
	prerenderDataId?: string,
	stagedPrerender = false,
): string {
	const resumeEntry = storageFreePayload
		? '@markless/core/web/resume-storage-free'
		: '@markless/core/web/resume';
	const fullResumeHandoff =
		stagedPrerender && prerenderDataId
			? [
					'async function marklessFullResumeHandoff(handoff) {',
					'\thandoff.root.__asyncResumeRuntimeStarted = true;',
					'\tconst group = await marklessLoadPrerenderTriggerGroup(handoff);',
					"\tconst { mergePrerenderPayloadRecords, resumePrerenderTriggerGroup } = await import('@markless/web/fns/prerender-trigger-resume');",
					// Staging is an optimization, never a correctness gate: interactions
					// no group covers (branch-arm events today, future record kinds
					// tomorrow) fall back to the full prerender resume.
					'\tif (!group) {',
					"\t\tconst { derivePrerenderResumeRecords, renderPrerenderBoundary, resumeFromPrerenderRecords } = await import('@markless/web/fns/prerender-resume');",
					// Cached per root, never registered on the dispatch chain: a registered
					// handler sits outermost and would starve the group loader above.
					'\t\thandoff.root.__marklessFullResumeRuntime ??= (async () => {',
					'\t\t\tconst marklessPrerenderData = await marklessLoadPrerenderData();',
					`\t\t\tconst fallbackRecords = mergePrerenderPayloadRecords(await derivePrerenderResumeRecords(marklessPrerenderData, ${loadSymbolName}), handoff.root);`,
					'\t\t\treturn (await resumeFromPrerenderRecords({',
					'\t\t\t\t...fallbackRecords,',
					'\t\t\t\troot: handoff.root,',
					`\t\t\t\tloadSymbol: ${loadSymbolName},`,
					`\t\t\t\trenderAsyncBoundary: (boundaryId, status, graph) => renderPrerenderBoundary(marklessPrerenderData, boundaryId, status, graph, ${loadSymbolName}),`,
					'\t\t\t})).runtime;',
					'\t\t})();',
					'\t\tconst marklessFullRuntime = await handoff.root.__marklessFullResumeRuntime;',
					'\t\tawait marklessFullRuntime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
					'\t\treturn;',
					'\t}',
					'\tconst records = mergePrerenderPayloadRecords({ state: group.state, view: group.view }, handoff.root);',
					'\tconst { runtime } = await resumePrerenderTriggerGroup({',
					'\t\t...records, groupId: group.groupId, graphNodeIds: group.graphNodeIds,',
					'\t\troot: handoff.root, loadSymbol: group.loadSymbol, prepareBoundaryArm: group.prepareBoundaryArm, renderBoundaryArm: group.renderBoundaryArm,',
					'\t});',
					'\tawait runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
					'}',
				].join('\n')
			: prerenderDataId
				? [
						'async function marklessFullResumeHandoff(handoff) {',
						'\thandoff.root.__marklessLinkedRenderDataBoot = true;',
						'\thandoff.root.__asyncResumeRuntimeStarted = true;',
						"\tconst { derivePrerenderResumeRecords, mergePrerenderPayloadRecords, renderPrerenderBoundary, resumeFromPrerenderRecords } = await import('@markless/web/fns/prerender-resume');",
						`\tconst records = await derivePrerenderResumeRecords(marklessPrerenderData, ${loadSymbolName});`,
						'\tconst mergedRecords = mergePrerenderPayloadRecords(records, handoff.root);',
						'\tconst { runtime } = await resumeFromPrerenderRecords({',
						'\t\t...mergedRecords,',
						'\t\troot: handoff.root,',
						`\t\tloadSymbol: ${loadSymbolName},`,
						`\t\trenderAsyncBoundary: (boundaryId, status, graph) => renderPrerenderBoundary(marklessPrerenderData, boundaryId, status, graph, ${loadSymbolName}),`,
						'\t});',
						'\tawait runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
						'}',
					].join('\n')
				: [
						'async function marklessFullResumeHandoff(handoff) {',
						'	handoff.root.__asyncResumeRuntimeStarted = true;',
						`	const { resumeFromPayloadDocument } = await import('${resumeEntry}');`,
						'	const { runtime } = await resumeFromPayloadDocument({',
						'		document: handoff.document,',
						'		root: handoff.root,',
						`		loadSymbol: ${loadSymbolName},`,
						'	});',
						'	await runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
						'}',
					].join('\n');
	const scalarOnlySpecialized =
		leanMode === 'scalar' &&
		scalarSpecializations.length > 0 &&
		allEventActionsHaveScalarPlan(runtimeDemandMap);
	const scalarDispatcher =
		scalarSpecializations.length > 0
			? emitSpecializedScalarDispatcher(
					scalarSpecializations,
					loadSymbolName,
					scalarOnlySpecialized ? 'fail' : 'full',
				)
			: emitSpecializedScalarDispatcher([], loadSymbolName, 'full');

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
	if (leanMode !== 'none') {
		// recordsOnly containers carry no payload scripts; lean routes read the
		// module-imported payload through a synthetic document instead.
		const leanInput = [
			'		document: input.root,',
			'		root: input.root,',
			'		event: input.event,',
			'		element: input.element,',
			'		runtimeDemandMap: payloadRuntimeDemandMap,',
			'		syncPolicyAlreadyApplied: input.syncPolicyAlreadyApplied === true,',
			`		loadSymbol: ${loadSymbolName},`,
			'	});',
		];
		const row = [
			"	const { resumeScalarRowEventFromPayloadDocument } = await import('@markless/web/event-only-lean/row');",
			'	await resumeScalarRowEventFromPayloadDocument({',
			...leanInput,
		];
		if (leanMode === 'scalar') {
			return [
				scalarOnlySpecialized ? '' : fullResumeHandoff,
				scalarDispatcher,
				'export async function resumeContainerEvent(input) {',
				executionLogEnabled
					? '	const marklessLogBefore = globalThis.__mxLog && new Set(globalThis.__mxLog);'
					: '',
				'	await marklessResumeSpecializedScalarEvent(input);',
				executionLogEnabled
					? '	if (marklessLogBefore) globalThis.__mxLoadLog().then(log => log.logMarklessSpecializedInteraction(input, marklessLogBefore));'
					: '',
				'}',
			].join('\n');
		}
		if (leanMode === 'row') {
			return ['export async function resumeContainerEvent(input) {', ...row, '}'].join('\n');
		}
		return [
			fullResumeHandoff,
			scalarDispatcher,
			'export async function resumeContainerEvent(input) {',
			'	if (marklessScalarSpecializedAction(input)) {',
			'		await marklessResumeSpecializedScalarEvent(input);',
			'		return;',
			'	}',
			...row,
			'}',
		].join('\n');
	}
	if (prerenderDataId) {
		return 'export async function resumeContainerEvent(_input) {}';
	}
	return [
		fullResumeHandoff,
		'export async function resumeContainerEvent(input) {',
		'	await marklessFullResumeHandoff({ ...input, document: input.root });',
		'}',
	].join('\n');
}

function emitPrerenderTriggerGroupLoader(
	groups: ReadonlyArray<{
		readonly eventName: string;
		readonly hostIndex: number;
		readonly hostTagName: string;
		readonly branchStartIndex?: number;
		readonly branchEndIndex?: number;
		readonly hostPath?: ReadonlyArray<number>;
		readonly moduleId: string;
	}>,
): string {
	return [
		'function marklessPrerenderTriggerMatches(input, index, tagName, eventName) {',
		'\tif (input.event?.type !== eventName) return false;',
		'\tconst host = marklessFindElementAtDomOrderIndex(input.root, index);',
		'\tif (!host || (tagName !== "*" && host.tagName.toLowerCase() !== tagName)) return false;',
		'\tconst target = input.event?.target;',
		'\treturn host === target || (!!target?.nodeType && typeof host.contains === "function" && host.contains(target));',
		'}',
		'function marklessPrerenderBranchTriggerMatches(input, startIndex, endIndex, hostPath, eventName) {',
		'\tif (input.event?.type !== eventName) return false;',
		'\tconst comments = [];',
		'\tconst collect = node => { for (const child of node.childNodes ?? []) { if (child.nodeType === 8) comments.push(child); collect(child); } };',
		'\tcollect(input.root);',
		'\tconst start = comments[startIndex], end = comments[endIndex], armNodes = [];',
		'\tlet within = false, done = false;',
		'\tconst between = node => { for (const child of node.childNodes ?? []) { if (child === start) { within = true; continue; } if (child === end) { done = true; return; } if (within) armNodes.push(child); else between(child); if (done) return; } };',
		'\tbetween(input.root);',
		'\tlet host = armNodes[hostPath[0]];',
		'\tfor (let index = 1; host && index < hostPath.length; index++) host = host.childNodes?.[hostPath[index]];',
		'\tconst target = input.event?.target;',
		'\treturn host?.nodeType === 1 && (host === target || (!!target?.nodeType && typeof host.contains === "function" && host.contains(target)));',
		'}',
		'function marklessLoadPrerenderTriggerGroup(input) {',
		...groups.map((group) => {
			const matches =
				group.eventName === 'self-wake'
					? 'input.event === 0'
					: group.hostPath
						? `marklessPrerenderBranchTriggerMatches(input, ${group.branchStartIndex}, ${group.branchEndIndex}, ${JSON.stringify(group.hostPath)}, ${JSON.stringify(group.eventName)})`
						: `marklessPrerenderTriggerMatches(input, ${group.hostIndex}, ${JSON.stringify(group.hostTagName.toLowerCase())}, ${JSON.stringify(group.eventName)})`;
			return `\tif (${matches}) return import(${JSON.stringify(group.moduleId)});`;
		}),
		'\treturn Promise.resolve(null);',
		'}',
	].join('\n');
}

type ScalarSpecialization = {
	readonly name: string;
	readonly hostNodeId: string;
	readonly eventName: string;
	readonly symbolId: string;
	readonly cell: string;
	readonly cellIndex: number;
	readonly initialCell: unknown;
	readonly hostIndex: number;
	readonly hostTagName: string;
	readonly syncPolicy: unknown;
	readonly write: {
		readonly kind?: string;
		readonly value?: unknown;
		readonly valueKind?: string;
		readonly updateOperator?: string;
	};
	readonly textUpdates: ReadonlyArray<{
		readonly hostNodeId: string;
		readonly index: number;
		readonly tagName: string;
		readonly prefix?: string;
	}>;
};

function scalarDispatcherSpecializations(input: {
	readonly payloadState?: unknown;
	readonly payloadView?: unknown;
	readonly runtimeDemandMap?: unknown;
	readonly symbolRoutes?: ReadonlyArray<SourceSymbolRoute>;
}): ReadonlyArray<ScalarSpecialization> {
	const state = input.payloadState as
		| { readonly cells?: ReadonlyArray<{ readonly graphNodeId?: unknown }> }
		| undefined;
	const view = input.payloadView as
		| {
				readonly events?: ReadonlyArray<{
					readonly hostNodeId?: unknown;
					readonly eventName?: unknown;
					readonly symbolIds?: unknown;
					readonly syncPolicy?: unknown;
				}>;
				readonly locators?: ReadonlyArray<{
					readonly hostNodeId?: unknown;
					readonly index?: unknown;
					readonly tagName?: unknown;
				}>;
		  }
		| undefined;
	const map = input.runtimeDemandMap as { readonly actions?: ReadonlyArray<any> } | undefined;
	// Composed pages (child symbol routes) are excluded from specialization until
	// child-coordinate routing is emitted into the dispatcher: their host/symbol
	// constants live in caller coordinates and a wrong constant here becomes a
	// dead click. They fall back to the full path, which handles routing.
	if ((input.symbolRoutes?.length ?? 0) > 0) return [];
	const cells = state?.cells ?? [];
	const locators = view?.locators ?? [];
	return (map?.actions ?? []).flatMap((action, index) => {
		const plan = action?.plan;
		if (action?.recordKind !== 'event' || plan?.version !== 1 || plan?.kind !== 'scalar')
			return [];
		const cellIndex = cells.findIndex((cell) => cell?.graphNodeId === plan.cell);
		const initialCell = cells[cellIndex];
		const host = locators.find((locator) => locator?.hostNodeId === action.hostNodeId);
		const event = view?.events?.find(
			(candidate) =>
				candidate?.hostNodeId === action.hostNodeId &&
				candidate?.eventName === action.eventName,
		);
		const symbolId = scalarActionSymbolId(plan.symbolId, event, input.symbolRoutes ?? []);
		if (!symbolId) return [];
		if (cellIndex < 0 || !initialCell || !host || typeof host.index !== 'number') return [];
		if (
			event &&
			syncPolicyGraphNodeIds(event.syncPolicy).some(
				(graphNodeId) => graphNodeId !== plan.cell,
			)
		)
			return [];
		const textUpdates = (plan.textUpdates ?? []).flatMap((update: any) => {
			const locator = locators.find(
				(candidate) => candidate?.hostNodeId === update.hostNodeId,
			);
			return locator && typeof locator.index === 'number'
				? [
						{
							hostNodeId: update.hostNodeId,
							index: locator.index,
							tagName: String(locator.tagName ?? '*'),
							...(update.prefix ? { prefix: update.prefix } : {}),
						},
					]
				: [];
		});
		if (textUpdates.length !== (plan.textUpdates ?? []).length) return [];
		return [
			{
				name: `marklessRunScalar${index}`,
				hostNodeId: action.hostNodeId,
				eventName: action.eventName,
				symbolId,
				cell: plan.cell,
				cellIndex,
				initialCell,
				hostIndex: host.index,
				hostTagName: String(host.tagName ?? '*'),
				syncPolicy: event?.syncPolicy ?? null,
				write: plan.write,
				textUpdates,
			},
		];
	});
}

function scalarActionSymbolId(
	plannedSymbolId: unknown,
	event: { readonly symbolIds?: unknown } | undefined,
	routes: ReadonlyArray<SourceSymbolRoute>,
): string | null {
	if (typeof plannedSymbolId !== 'string') return null;
	const eventSymbolIds = Array.isArray(event?.symbolIds)
		? event.symbolIds.filter((symbolId): symbolId is string => typeof symbolId === 'string')
		: [];
	const routedSymbolId = eventSymbolIds.find((symbolId) =>
		routes.some((route) => symbolId.startsWith(route.prefix)),
	);
	if (routedSymbolId) return routedSymbolId;
	if (eventSymbolIds.some((symbolId) => /^[^:]+:symbol:/.test(symbolId))) return null;
	if (eventSymbolIds.length > 0 && !eventSymbolIds.includes(plannedSymbolId)) return null;
	return plannedSymbolId;
}

function allEventActionsHaveScalarPlan(runtimeDemandMap: unknown): boolean {
	const actions = (
		runtimeDemandMap as
			| {
					readonly actions?: ReadonlyArray<{
						readonly recordKind?: unknown;
						readonly plan?: { readonly kind?: unknown };
					}>;
			  }
			| undefined
	)?.actions;
	const eventActions = (actions ?? []).filter((action) => action.recordKind === 'event');
	return (
		eventActions.length > 0 && eventActions.every((action) => action.plan?.kind === 'scalar')
	);
}

function emitSpecializedScalarDispatcher(
	actions: ReadonlyArray<ScalarSpecialization>,
	loadSymbolName: string,
	fallback: 'full' | 'fail',
): string {
	const fallbackName =
		fallback === 'fail'
			? 'marklessScalarSpecializedHostMiss'
			: 'marklessScalarSpecializedFallback';
	const fallbackBody =
		fallback === 'full'
			? [
					'async function marklessScalarSpecializedFallback(input, site, syncPolicyAlreadyApplied = input.syncPolicyAlreadyApplied === true) {',
					'	if (import.meta.env?.DEV) console.warn(Object.assign(new Error("MARKLESS_SCALAR_SPECIALIZED_FALLBACK"), { code: "MARKLESS_SCALAR_SPECIALIZED_FALLBACK", site }));',
					'	await marklessFullResumeHandoff({ ...input, document: input.root, syncPolicyAlreadyApplied });',
					'}',
				]
			: [];
	return [
		'async function marklessResumeSpecializedScalarEvent(input) {',
		'	const action = marklessScalarSpecializedAction(input);',
		'	if (action) {',
		'		try {',
		'			return await action(input);',
		'		} catch (error) {',
		`			if (error?.code === "MARKLESS_SCALAR_SPECIALIZED_ESCALATE") return ${fallbackName}(input, error.site ?? "escalate", error.syncPolicyAlreadyApplied === true);`,
		'			throw error;',
		'		}',
		'	}',
		// No matching markless record: the event is not ours (router links, page
		// chrome) — pass through silently on fail-mode pages; full-mode pages
		// hand off so non-scalar records still dispatch.
		fallback === 'fail' ? '	return;' : `	return ${fallbackName}(input, "event-match");`,
		'}',
		fallback === 'fail'
			? 'function marklessScalarSpecializedHostMiss(_input, site) { return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_HOST_MISS", site); }'
			: 'function marklessScalarSpecializedHostMiss(input, site) { return marklessScalarSpecializedFallback(input, site); }',
		'function marklessScalarSpecializedAction(input) {',
		...actions.map(
			(action) =>
				`	if (marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, ${action.hostIndex}), ${JSON.stringify(action.hostTagName.toLowerCase())}, ${JSON.stringify(action.eventName)}, ${JSON.stringify(action.hostNodeId)})) return ${action.name};`,
		),
		'}',
		'function marklessScalarEventMatches(input, host, tagName, eventName, hostNodeId) {',
		'	const eventTypeMatches = input.event?.type === eventName;',
		'	if (!eventTypeMatches) return false;',
		'	if (!host || (tagName !== "*" && host.tagName.toLowerCase() !== tagName)) return false;',
		'	const eventTarget = input.event?.target;',
		'	return host === eventTarget || (!!eventTarget?.nodeType && typeof host.contains === "function" && host.contains(eventTarget));',
		'}',
		...actions.map((action) => emitScalarAction(action, loadSymbolName)),
		...fallbackBody,
	].join('\n');
}

function emitScalarAction(action: ScalarSpecialization, loadSymbolName: string): string {
	return [
		`async function ${action.name}(input) {`,
		'	let syncPolicyAlreadyApplied = input.syncPolicyAlreadyApplied === true;',
		'	const values = input.root.__marklessEventOnlyGraph || new Map();',
		'	input.root.__marklessEventOnlyGraph = values;',
		`	if (!values.has(${JSON.stringify(action.cell)})) values.set(${JSON.stringify(action.cell)}, marklessDecodeScalarCell(marklessReadScalarCell(input.root, ${JSON.stringify(action.cell)}) ?? ${JSON.stringify(action.initialCell)}, ${JSON.stringify(action.cell)}, ${JSON.stringify(`markless/state cell ${action.cell}`)}));`,
		`	const state = { value: values.get(${JSON.stringify(action.cell)}), dirty: false };`,
		'	try {',
		`	const host = marklessFindElementAtDomOrderIndex(input.root, ${action.hostIndex});`,
		`	if (!host || (${JSON.stringify(action.hostTagName.toLowerCase())} !== "*" && host.tagName.toLowerCase() !== ${JSON.stringify(action.hostTagName.toLowerCase())})) return marklessScalarSpecializedHostMiss(input, "host");`,
		...action.textUpdates.map(
			(update, index) =>
				`	const textTarget${index} = marklessFindElementAtDomOrderIndex(input.root, ${update.index});`,
		),
		...action.textUpdates.map(
			(update, index) =>
				`	if (!textTarget${index} || (${JSON.stringify(update.tagName.toLowerCase())} !== "*" && textTarget${index}.tagName.toLowerCase() !== ${JSON.stringify(update.tagName.toLowerCase())})) return marklessScalarSpecializedHostMiss(input, "text-target");`,
		),
		'	const graph = {',
		`		hasCell(graphNodeId) { return graphNodeId === ${JSON.stringify(action.cell)}; },`,
		`		read(graphNodeId, path = []) { if (graphNodeId !== ${JSON.stringify(action.cell)} || path.length) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "read"); return state.value; },`,
		`		write(write) { if (write.graphNodeId !== ${JSON.stringify(action.cell)} || (write.path?.length ?? 0)) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "write"); if (!Object.is(state.value, write.value)) { state.value = write.value; values.set(${JSON.stringify(action.cell)}, state.value); state.dirty = true; } },`,
		`		update(update) { if (update.graphNodeId !== ${JSON.stringify(action.cell)} || (update.path?.length ?? 0)) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "update"); const previous = state.value; const next = update.update(previous); if (!Object.is(previous, next)) { state.value = next; values.set(${JSON.stringify(action.cell)}, state.value); state.dirty = true; } return update.returnValue === "previous" ? previous : update.returnValue === "next" ? next : undefined; },`,
		'		call() { return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "call"); },',
		'		async flush() {},',
		'	};',
		...(action.syncPolicy
			? [
					`	const syncPolicy = ${JSON.stringify(action.syncPolicy)};`,
					'	if (syncPolicy && !syncPolicyAlreadyApplied) {',
					"		const { runSyncPolicyActions } = await import('@markless/web/inline/sync-policy-core');",
					'		runSyncPolicyActions(syncPolicy, graph, input.event);',
					'		syncPolicyAlreadyApplied = true;',
					'	}',
				]
			: []),
		...emitScalarWrite(action),
		`	const symbol = await Promise.resolve(${loadSymbolName}(${JSON.stringify(action.symbolId)}));`,
		'	await Promise.resolve(symbol({ graph: { ...graph, write() {}, update(update) { const value = graph.read(update.graphNodeId, update.path ?? []); return update.returnValue === "previous" || update.returnValue === "next" ? value : undefined; } }, event: input.event, element: host, getElementHandle: () => undefined }));',
		'	if (state.dirty) {',
		'		state.dirty = false;',
		...action.textUpdates.map(
			(update, index) =>
				`		textTarget${index}.textContent = marklessUpdateText({ domUpdate: { hostNodeId: ${JSON.stringify(update.hostNodeId)} }, value: ${JSON.stringify(update.prefix ?? '')} + (state.value == null ? '' : String(state.value)) }, ${JSON.stringify(update.hostNodeId)}).value;`,
		),
		'	}',
		'	} catch (error) {',
		'		if (error?.code === "MARKLESS_SCALAR_SPECIALIZED_ESCALATE") error.syncPolicyAlreadyApplied = syncPolicyAlreadyApplied;',
		'		throw error;',
		'	}',
		'}',
	].join('\n');
}

function emitScalarWrite(action: ScalarSpecialization): string[] {
	if (action.write.kind === 'update') {
		return [
			'	marklessWriteScalar({ graph }, {',
			`		graphNodeId: ${JSON.stringify(action.cell)},`,
			'		returnValue: "next",',
			'		update(value) {',
			`			return Number(value) ${action.write.updateOperator === '--' ? '-' : '+'} 1;`,
			'		},',
			'	});',
		];
	}
	return [
		'	marklessWriteScalar({ graph }, {',
		`		graphNodeId: ${JSON.stringify(action.cell)},`,
		`		value: ${action.write.valueKind === 'undefined' ? 'undefined' : JSON.stringify(action.write.value)},`,
		'	});',
	];
}

function syncPolicyGraphNodeIds(policy: unknown): string[] {
	if (!policy || typeof policy !== 'object') return [];
	const branches = Array.isArray((policy as { readonly branches?: unknown }).branches)
		? (policy as { readonly branches: ReadonlyArray<{ readonly when?: unknown }> }).branches
		: [policy as { readonly when?: unknown }];
	return [...new Set(branches.flatMap((branch) => conditionGraphNodeIds(branch.when)))].sort();
}

function conditionGraphNodeIds(condition: unknown): string[] {
	if (!condition || typeof condition !== 'object') return [];
	const typed = condition as {
		readonly type?: unknown;
		readonly graphNodeId?: unknown;
		readonly condition?: unknown;
		readonly conditions?: ReadonlyArray<unknown>;
	};
	if (typed.type === 'graph-truthy' && typeof typed.graphNodeId === 'string')
		return [typed.graphNodeId];
	if (typed.type === 'not') return conditionGraphNodeIds(typed.condition);
	if ((typed.type === 'and' || typed.type === 'or') && Array.isArray(typed.conditions)) {
		return typed.conditions.flatMap(conditionGraphNodeIds);
	}
	return [];
}

type LeanResumeMode = 'none' | 'scalar' | 'row' | 'mixed';

function leanResumeMode(runtimeDemandMap: unknown): LeanResumeMode {
	const recordKinds = (
		runtimeDemandMap as {
			readonly recordKinds?: ReadonlyArray<{
				readonly kind: string;
				readonly replaced: boolean;
			}>;
		}
	)?.recordKinds;
	if (!recordKinds) return 'none';
	const replaced = new Map(recordKinds.map((record) => [record.kind, record.replaced]));
	const scalar = replaced.get('event') === true && replaced.get('dom-update') === true;
	const row = replaced.get('keyed-repeat') === true && replaced.get('dom-update') === true;
	if (scalar && row) return 'mixed';
	if (scalar) return 'scalar';
	if (row) return 'row';
	return 'none';
}

function emitExecutionLogLoader(): string {
	return `globalThis.__mxLoadLog ||= () => import(${JSON.stringify(MARKLESS_EXECUTION_LOG_MODULE_ID)});`;
}

function emitLoadSymbol(
	input: {
		readonly resolverId: string;
		readonly symbols: ReadonlyArray<SourceSymbolRow>;
		readonly hasBoundSymbols?: boolean;
	},
	sourceReaderName?: string,
) {
	if (input.symbols.length > 0 && input.symbols.length <= SMALL_SYMBOL_DIRECT_LOAD_LIMIT) {
		const direct = emitDirectSourceSymbolLoader(input.symbols, sourceReaderName);
		if (!input.hasBoundSymbols) return direct;
		return [
			`const marklessSymbolResolverModule = () => import('${input.resolverId}');`,
			direct.replace(
				'\treturn Promise.reject(new Error(`Unknown async symbol ${symbolId}`));',
				'\treturn marklessSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
			),
		].join('\n');
	}

	return [
		`const marklessSymbolResolverModule = () => import('${input.resolverId}');`,
		'function loadSymbol(symbolId) {',
		'	return marklessSymbolResolverModule().then((mod) => mod.loadSymbol(symbolId));',
		'}',
	].join('\n');
}

function emitDirectSourceSymbolLoader(
	symbols: ReadonlyArray<SourceSymbolRow>,
	readerName = 'readMarklessSourceSymbol',
): string {
	return [
		'function loadSymbol(symbolId) {',
		...symbols.flatMap((symbol) => [
			`	if (symbolId === ${JSON.stringify(symbol.id)}) return import('${symbol.chunk}')`,
			`		.then((mod) => ${readerName}(mod, ${JSON.stringify(symbol.exportName)}));`,
		]),
		'	return Promise.reject(new Error(`Unknown async symbol ${symbolId}`));',
		'}',
		emitSourceSymbolExportReader(readerName),
	].join('\n');
}

function emitSourceSymbolExportReader(name = 'readMarklessSourceSymbol'): string {
	return [
		`function ${name}(mod, exportName) {`,
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
