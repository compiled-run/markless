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
	readonly payloadId: string;
	readonly resolverId: string;
	readonly payloadState?: unknown;
	readonly payloadView?: unknown;
	readonly runtimeDemandMap?: unknown;
	readonly needsFullResume?: boolean;
	readonly symbols: ReadonlyArray<SourceSymbolRow>;
	readonly symbolRoutes: ReadonlyArray<SourceSymbolRoute>;
	readonly executionLog?: MarklessExecutionLogMode;
}) {
	const routeSymbols = input.symbolRoutes.length > 0;
	const resumeSymbolLoader = routeSymbols ? 'marklessSsrLoadSymbolRoute' : 'loadSymbol';
	const scalarSpecializations = scalarDispatcherSpecializations(input);
	return [
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
		emitResumeContainerEvent(
			resumeSymbolLoader,
			input.needsFullResume ?? false,
			// Composed pages (child symbol routes) take the full path: lean record
			// matching does not account for runtime child composition (same ruling
			// as the scalar-specialization exclusion; unmatched events pass through
			// harmlessly since the ignoreUnmatched contract landed).
			input.symbolRoutes.length > 0 ? 'none' : leanResumeMode(input.runtimeDemandMap),
			scalarSpecializations,
			input.runtimeDemandMap,
		),
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

function emitResumeContainerEvent(
	loadSymbolName: string,
	needsFullResume: boolean,
	leanMode: LeanResumeMode,
	scalarSpecializations: ReadonlyArray<ScalarSpecialization>,
	runtimeDemandMap: unknown,
): string {
	const fullResumeHandoff = [
		'async function marklessFullResumeHandoff(handoff) {',
		'	handoff.root.__asyncResumeRuntimeStarted = true;',
		"	const { resumeFromPayloadDocument } = await import('@markless/core/web/resume');",
		'	const { runtime } = await resumeFromPayloadDocument({',
		'		document: handoff.document,',
		'		root: handoff.root,',
		`		loadSymbol: ${loadSymbolName},`,
		'	});',
		'	await runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: handoff.syncPolicyAlreadyApplied === true, ignoreUnmatched: true });',
		'}',
	].join('\n');
	const scalarOnlySpecialized = leanMode === 'scalar' && scalarSpecializations.length > 0 && allEventActionsHaveScalarPlan(runtimeDemandMap);
	const scalarDispatcher = scalarSpecializations.length > 0
		? emitSpecializedScalarDispatcher(scalarSpecializations, loadSymbolName, scalarOnlySpecialized ? 'fail' : 'full')
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
				'	await marklessResumeSpecializedScalarEvent(input);',
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
	readonly hostIndex: number;
	readonly hostTagName: string;
	readonly syncPolicy: unknown;
	readonly write: { readonly kind?: string; readonly value?: unknown; readonly valueKind?: string; readonly updateOperator?: string };
	readonly textUpdates: ReadonlyArray<{ readonly hostNodeId: string; readonly index: number; readonly tagName: string; readonly prefix?: string }>;
};

function scalarDispatcherSpecializations(input: {
	readonly payloadState?: unknown;
	readonly payloadView?: unknown;
	readonly runtimeDemandMap?: unknown;
	readonly symbolRoutes?: ReadonlyArray<SourceSymbolRoute>;
}): ReadonlyArray<ScalarSpecialization> {
	const state = input.payloadState as { readonly cells?: ReadonlyArray<{ readonly graphNodeId?: unknown }> } | undefined;
	const view = input.payloadView as {
		readonly events?: ReadonlyArray<{ readonly hostNodeId?: unknown; readonly eventName?: unknown; readonly symbolIds?: unknown; readonly syncPolicy?: unknown }>;
		readonly locators?: ReadonlyArray<{ readonly hostNodeId?: unknown; readonly index?: unknown; readonly tagName?: unknown }>;
	} | undefined;
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
		if (action?.recordKind !== 'event' || plan?.version !== 1 || plan?.kind !== 'scalar') return [];
		const cellIndex = cells.findIndex((cell) => cell?.graphNodeId === plan.cell);
		const host = locators.find((locator) => locator?.hostNodeId === action.hostNodeId);
		const event = view?.events?.find((candidate) =>
			candidate?.hostNodeId === action.hostNodeId && candidate?.eventName === action.eventName
		);
		const symbolId = scalarActionSymbolId(plan.symbolId, event, input.symbolRoutes ?? []);
		if (!symbolId) return [];
		if (cellIndex < 0 || !host || typeof host.index !== 'number') return [];
		if (event && syncPolicyGraphNodeIds(event.syncPolicy).some((graphNodeId) => graphNodeId !== plan.cell)) return [];
		const textUpdates = (plan.textUpdates ?? []).flatMap((update: any) => {
			const locator = locators.find((candidate) => candidate?.hostNodeId === update.hostNodeId);
			return locator && typeof locator.index === 'number'
				? [{ hostNodeId: update.hostNodeId, index: locator.index, tagName: String(locator.tagName ?? '*'), ...(update.prefix ? { prefix: update.prefix } : {}) }]
				: [];
		});
		if (textUpdates.length !== (plan.textUpdates ?? []).length) return [];
		return [{
			name: `marklessRunScalar${index}`,
			hostNodeId: action.hostNodeId,
			eventName: action.eventName,
			symbolId,
			cell: plan.cell,
			cellIndex,
			hostIndex: host.index,
			hostTagName: String(host.tagName ?? '*'),
			syncPolicy: event?.syncPolicy ?? null,
			write: plan.write,
			textUpdates,
		}];
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
		routes.some((route) => symbolId.startsWith(route.prefix))
	);
	if (routedSymbolId) return routedSymbolId;
	if (eventSymbolIds.some((symbolId) => /^[^:]+:symbol:/.test(symbolId))) return null;
	if (eventSymbolIds.length > 0 && !eventSymbolIds.includes(plannedSymbolId)) return null;
	return plannedSymbolId;
}

function allEventActionsHaveScalarPlan(runtimeDemandMap: unknown): boolean {
	const actions = (runtimeDemandMap as {
		readonly actions?: ReadonlyArray<{
			readonly recordKind?: unknown;
			readonly plan?: { readonly kind?: unknown };
		}>;
	} | undefined)?.actions;
	const eventActions = (actions ?? []).filter((action) => action.recordKind === 'event');
	return eventActions.length > 0 && eventActions.every((action) => action.plan?.kind === 'scalar');
}

function emitSpecializedScalarDispatcher(actions: ReadonlyArray<ScalarSpecialization>, loadSymbolName: string, fallback: 'full' | 'fail'): string {
	const fallbackName = fallback === 'fail' ? 'marklessScalarSpecializedHostMiss' : 'marklessScalarSpecializedFallback';
	const fallbackBody = fallback === 'full'
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
		...actions.map((action) =>
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
		`	const state = { value: marklessDecodeScalarCell(marklessReadScalarCell(input.root, ${action.cellIndex}), ${JSON.stringify(action.cell)}, ${JSON.stringify(`markless/state cell[${action.cellIndex}]`)}), dirty: false };`,
		'	try {',
		`	const host = marklessFindElementAtDomOrderIndex(input.root, ${action.hostIndex});`,
		`	if (!host || (${JSON.stringify(action.hostTagName.toLowerCase())} !== "*" && host.tagName.toLowerCase() !== ${JSON.stringify(action.hostTagName.toLowerCase())})) return marklessScalarSpecializedHostMiss(input, "host");`,
		...action.textUpdates.map((update, index) =>
			`	const textTarget${index} = marklessFindElementAtDomOrderIndex(input.root, ${update.index});`,
		),
		...action.textUpdates.map((update, index) => `	if (!textTarget${index} || (${JSON.stringify(update.tagName.toLowerCase())} !== "*" && textTarget${index}.tagName.toLowerCase() !== ${JSON.stringify(update.tagName.toLowerCase())})) return marklessScalarSpecializedHostMiss(input, "text-target");`),
		'	const graph = {',
		`		hasCell(graphNodeId) { return graphNodeId === ${JSON.stringify(action.cell)}; },`,
		`		read(graphNodeId, path = []) { if (graphNodeId !== ${JSON.stringify(action.cell)} || path.length) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "read"); return state.value; },`,
		`		write(write) { if (write.graphNodeId !== ${JSON.stringify(action.cell)} || (write.path?.length ?? 0)) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "write"); if (!Object.is(state.value, write.value)) { state.value = write.value; state.dirty = true; } },`,
		`		update(update) { if (update.graphNodeId !== ${JSON.stringify(action.cell)} || (update.path?.length ?? 0)) return marklessScalarSpecializedError("MARKLESS_SCALAR_SPECIALIZED_ESCALATE", "update"); const previous = state.value; const next = update.update(previous); if (!Object.is(previous, next)) { state.value = next; state.dirty = true; } return update.returnValue === "previous" ? previous : update.returnValue === "next" ? next : undefined; },`,
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
		...action.textUpdates.map((update, index) =>
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
	if (typed.type === 'graph-truthy' && typeof typed.graphNodeId === 'string') return [typed.graphNodeId];
	if (typed.type === 'not') return conditionGraphNodeIds(typed.condition);
	if ((typed.type === 'and' || typed.type === 'or') && Array.isArray(typed.conditions)) {
		return typed.conditions.flatMap(conditionGraphNodeIds);
	}
	return [];
}

type LeanResumeMode = 'none' | 'scalar' | 'row' | 'mixed';

function leanResumeMode(runtimeDemandMap: unknown): LeanResumeMode {
	const recordKinds = (runtimeDemandMap as { readonly recordKinds?: ReadonlyArray<{ readonly kind: string; readonly replaced: boolean }> })?.recordKinds;
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
