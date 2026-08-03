import type { MarklessClientOutput, MarklessEnvironment } from './types.ts';
import { MARKLESS_EXECUTION_LOG_MODULE_ID } from './execution-log.ts';
import type { MarklessExecutionLogMode } from './types.ts';
import type { InlineResumerSourceVariants } from '@markless/web/inline/resumer';
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
	readonly needsFullResume?: boolean;
	readonly devResumeReexport?: boolean;
	readonly publicRenderModuleSource: string;
	readonly publicRenderRootExportName: string | null;
	readonly publicCsrModuleSource: string;
	readonly nativeCsr?: boolean;
	readonly publicRenderCsrExportName: string | null;
	readonly publicSsrModuleSource: string;
	readonly publicRenderSsrExportName: string | null;
	readonly renderDataId?: string;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly behaviorSymbols?: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
	readonly hasBoundSymbols?: boolean;
	readonly prerenderRecords?: boolean;
}) {
	const symbolsOnly = input.environment === 'client' && input.clientOutput === 'symbols-only';
	const routeSymbols = input.environment === 'client' && input.symbolRoutes.length > 0;
	return [
		(!input.publicSsrModuleSource && !input.publicRenderModuleSource) ||
		symbolsOnly ||
		!input.renderDataId ||
		(input.environment === 'client' &&
			!input.publicRenderModuleSource &&
			!input.prerenderRecords)
			? ''
			: `import { marklessRenderData } from '${input.renderDataId}';`,
		symbolsOnly ||
		(input.environment === 'client' && input.nativeCsr && !input.prerenderRecords)
			? ''
			: `import { state as payloadState, view as payloadView, runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		'',
		emitLoadSymbol(input),
		input.behaviorSymbols?.length
			? emitDirectSourceSymbolLoader(input.behaviorSymbols).replace(
					'function loadSymbol(',
					'function loadBehaviorSymbol(',
				)
			: '',
		input.environment === 'client' && input.executionLog !== 'never'
			? emitExecutionLogLoader()
			: '',
		routeSymbols ? 'const marklessLoadLocalSymbol = loadSymbol;' : '',
		symbolsOnly && !routeSymbols ? 'export { loadSymbol };' : '',
		symbolsOnly || (input.environment === 'client' && input.nativeCsr)
			? ''
			: 'export { payloadView };',
		symbolsOnly || (input.environment === 'client' && input.nativeCsr)
			? ''
			: 'export { payloadRuntimeDemandMap };',
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
		input.environment === 'server' || symbolsOnly || input.prerenderRecords
			? ''
			: input.publicCsrModuleSource,
		input.environment === 'client' && !input.prerenderRecords ? '' : input.publicSsrModuleSource,
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
			resumeModuleUrl: input.resumeModuleUrl,
			prerenderWakeModuleUrl: input.prerenderWakeModuleUrl,
					rootExportName: input.publicRenderRootExportName,
					csrExportName: input.publicRenderCsrExportName,
					ssrExportName: input.publicRenderSsrExportName,
					prerenderRecords: input.prerenderRecords,
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
	readonly prerenderDataId?: string;
	readonly installResumeSummary?: boolean;
	// The wake variant serves pages whose container carries no payload
	// scripts; lean routes read the payload document and must never emit.
	readonly recordsOnly?: boolean;
}) {
	const routeSymbols = input.symbolRoutes.length > 0;
	const resumeSymbolLoader = routeSymbols ? 'marklessSsrLoadSymbolRoute' : 'loadSymbol';
	const scalarSpecializations = scalarDispatcherSpecializations(input);
	if (input.recordsOnly && !input.needsFullResume) {
		// Lean pages keep their payload container until wake staging lands;
		// a records-only wake for them would strand lean routes payload-less.
		throw new Error('MARKLESS_WAKE_VARIANT_REQUIRES_FULL_RESUME');
	}
	const resumeContainerEvent = emitResumeContainerEvent(
		resumeSymbolLoader,
		input.needsFullResume ?? false,
		(input.payloadState as { readonly version?: unknown } | undefined)?.version ===
			ASYNC_PROTOCOL_VERSION,
		input.symbolRoutes.length > 0 ? 'none' : leanResumeMode(input.runtimeDemandMap),
		scalarSpecializations,
		input.runtimeDemandMap,
		input.executionLog !== 'never',
		input.prerenderDataId,
	);
	return [
		input.prerenderDataId && resumeContainerEvent.includes('marklessPrerenderData')
			? `import { marklessPrerenderData } from '${input.prerenderDataId}';`
			: '',
		`import { runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		scalarSpecializations.length > 0
			? [
					"import { marklessDecodeScalarCell, marklessFindElementAtDomOrderIndex, marklessReadScalarCell, marklessScalarSpecializedError } from '@markless/web/fns/scalar-specialized';",
					"import { marklessWriteScalar } from '@markless/web/fns/write-scalar';",
					"import { marklessUpdateText } from '@markless/web/fns/update-text';",
				].join('\n')
			: '',
		'',
		input.executionLog === 'never' ? '' : emitExecutionLogLoader(),
		input.installResumeSummary && input.executionLog !== 'never'
			? 'globalThis.__mxLoadLog().then(log => log.installMarklessExecutionLog());'
			: null,
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
		resumeContainerEvent,
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
	readonly inlineResumerSources?: InlineResumerSourceVariants;
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
	readonly csrExportName: string | null;
	readonly ssrExportName: string | null;
	readonly prerenderRecords?: boolean;
}): string {
	const renderCsrEntry =
		(input.rootExportName || input.csrExportName) &&
		input.environment !== 'server' &&
		!input.prerenderRecords
			? [`	renderCsr: ${input.rootExportName ?? input.csrExportName},`]
			: [];
	// The optional render context is the per-request streaming channel (T107):
	// dropping it here would silently force every page back to blocking SSR.
	const renderSsrEntry =
		input.ssrExportName && (input.environment !== 'client' || input.prerenderRecords)
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

function emitResumeContainerEvent(
	loadSymbolName: string,
	needsFullResume: boolean,
	storageFreePayload: boolean,
	leanMode: LeanResumeMode,
	scalarSpecializations: ReadonlyArray<ScalarSpecialization>,
	runtimeDemandMap: unknown,
	executionLogEnabled: boolean,
	prerenderDataId?: string,
): string {
	const resumeEntry = storageFreePayload
		? '@markless/core/web/resume-storage-free'
		: '@markless/core/web/resume';
	const fullResumeHandoff = prerenderDataId
		? [
				'async function marklessFullResumeHandoff(handoff) {',
				'\thandoff.root.__marklessLinkedRenderDataBoot = true;',
				'\thandoff.root.__asyncResumeRuntimeStarted = true;',
				"\tconst { derivePrerenderResumeRecords, renderPrerenderBoundary, resumeFromPrerenderRecords } = await import('@markless/web/fns/prerender-resume');",
				`\tconst records = await derivePrerenderResumeRecords(marklessPrerenderData, ${loadSymbolName});`,
				'\tconst { runtime } = await resumeFromPrerenderRecords({',
				'\t\t...records,',
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

function emitLoadSymbol(input: {
	readonly resolverId: string;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly hasBoundSymbols?: boolean;
}) {
	if (
		!input.hasBoundSymbols &&
		input.symbols.length > 0 &&
		input.symbols.length <= SMALL_SYMBOL_DIRECT_LOAD_LIMIT
	) {
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
