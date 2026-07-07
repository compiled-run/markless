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
		scalarSpecializations.length > 0
			? `import { state as payloadState, runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`
			: `import { runtimeDemandMap as payloadRuntimeDemandMap } from '${input.payloadId}';`,
		scalarSpecializations.length > 0
			? "import { marklessWriteScalar } from '@markless/web/fns/write-scalar';"
			: '',
		scalarSpecializations.length > 0
			? "import { marklessUpdateText } from '@markless/web/fns/update-text';"
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
			leanResumeMode(input.runtimeDemandMap),
			scalarSpecializations,
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
		'	await runtime.dispatch(handoff.event, { syncPolicyAlreadyApplied: true });',
		'}',
	].join('\n');
	const scalarDispatcher = scalarSpecializations.length > 0
		? emitSpecializedScalarDispatcher(scalarSpecializations, loadSymbolName)
		: emitSpecializedScalarDispatcher([], loadSymbolName);
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
			'		eventRecord: input.eventRecord,',
			'		runtimeDemandMap: payloadRuntimeDemandMap,',
			'		syncPolicyAlreadyApplied: !!input.eventRecord,',
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
				fullResumeHandoff,
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
}): ReadonlyArray<ScalarSpecialization> {
	const state = input.payloadState as { readonly cells?: ReadonlyArray<{ readonly graphNodeId?: unknown }> } | undefined;
	const view = input.payloadView as {
		readonly events?: ReadonlyArray<{ readonly hostNodeId?: unknown; readonly eventName?: unknown; readonly syncPolicy?: unknown }>;
		readonly locators?: ReadonlyArray<{ readonly hostNodeId?: unknown; readonly index?: unknown; readonly tagName?: unknown }>;
	} | undefined;
	const map = input.runtimeDemandMap as { readonly actions?: ReadonlyArray<any> } | undefined;
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
			symbolId: plan.symbolId,
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

function emitSpecializedScalarDispatcher(actions: ReadonlyArray<ScalarSpecialization>, loadSymbolName: string): string {
	return [
		'async function marklessResumeSpecializedScalarEvent(input) {',
		'	const action = marklessScalarSpecializedAction(input);',
		'	if (action) {',
		'		try {',
		'			return await action(input);',
		'		} catch (error) {',
		'			if (error?.code === "MARKLESS_SCALAR_SPECIALIZED_ESCALATE") return marklessScalarSpecializedFallback(input, error.site ?? "escalate");',
		'			throw error;',
		'		}',
		'	}',
		'	return marklessScalarSpecializedFallback(input, "event-match");',
		'}',
		'function marklessScalarSpecializedAction(input) {',
		...actions.map((action) =>
			`	if (marklessScalarEventMatches(input, marklessFindElementAtDomOrderIndex(input.root, ${action.hostIndex}, ${JSON.stringify(action.hostTagName)}), ${JSON.stringify(action.eventName)}, ${JSON.stringify(action.hostNodeId)})) return ${action.name};`,
		),
		'}',
		'function marklessScalarEventMatches(input, host, eventName, hostNodeId) {',
		'	const eventTypeMatches = input.event?.type === eventName;',
		'	if (!eventTypeMatches) return false;',
		'	if (input.eventRecord) {',
		'		return input.eventRecord.hostNodeId === hostNodeId && input.eventRecord.eventName === eventName;',
		'	}',
		'	const eventTarget = input.event?.target;',
		'	return !!host && (host === eventTarget || (!!eventTarget?.nodeType && typeof host.contains === "function" && host.contains(eventTarget)));',
		'}',
		...actions.map((action) => emitScalarAction(action, loadSymbolName)),
		'async function marklessScalarSpecializedFallback(input, site) {',
		'	if (import.meta.env?.DEV) console.warn(Object.assign(new Error("MARKLESS_SCALAR_SPECIALIZED_FALLBACK"), { code: "MARKLESS_SCALAR_SPECIALIZED_FALLBACK", site }));',
		'	await marklessFullResumeHandoff({ ...input, document: input.root });',
		'}',
		'function marklessFindElementAtDomOrderIndex(root, expectedIndex, tagName) {',
		'	let index = 0, found;',
		'	const visit = (node) => {',
		'		if (found) return;',
		'		if (node.nodeType === 1) { if (index === expectedIndex) found = node; index++; }',
		'		for (const child of Array.from(node.childNodes ?? [])) visit(child);',
		'	};',
		'	visit(root);',
		'	return found && (tagName === "*" || found.tagName.toLowerCase() === tagName.toLowerCase()) ? found : undefined;',
		'}',
		'function marklessScalarSlotText(value) { return value == null ? "" : String(value); }',
		'function marklessDecodeScalarSlot(slot) {',
		'	if (slot === null || typeof slot === "string" || typeof slot === "number" || typeof slot === "boolean") return slot;',
		'	if (slot?.$type === "undefined") return undefined;',
		'	if (slot?.$type === "bigint") return BigInt(slot.value);',
		'	return new Date(slot.value);',
		'}',
		'function marklessAssertScalarCell(cell, graphNodeId, site) {',
		'	if (!cell || cell.graphNodeId !== graphNodeId || cell.valueKind !== "scalar") throw marklessScalarPayloadInvalid(`Invalid ${site}: expected scalar cell.`, site);',
		'	const value = cell.value;',
		'	if (!value || value.version !== 1 || !Array.isArray(value.records) || value.records.length !== 0) throw marklessScalarPayloadInvalid(`Invalid ${site}.value: expected scalar value payload.`, `${site}.value`);',
		'	const slot = value.root;',
		'	if (slot === null || typeof slot === "string" || typeof slot === "number" || typeof slot === "boolean") return;',
		'	if (!slot || typeof slot !== "object") throw marklessScalarPayloadInvalid(`Invalid ${site}.value.root: expected serialized scalar slot.`, `${site}.value.root`);',
		'	if (slot.$type === "undefined") return;',
		'	if (slot.$type === "bigint" && typeof slot.value === "string") { try { BigInt(slot.value); return; } catch {} }',
		'	if (slot.$type === "date" && typeof slot.value === "string" && !Number.isNaN(new Date(slot.value).getTime())) return;',
		'	throw marklessScalarPayloadInvalid(`Invalid ${site}.value.root: expected serialized scalar slot.`, `${site}.value.root`);',
		'}',
		'function marklessScalarPayloadInvalid(message, site) { return Object.assign(new Error(message), { code: "MARKLESS_PAYLOAD_INVALID", severity: "error", phase: "payload", title: "Invalid resumability payload", message, why: "The markless/state payload did not match the resumability protocol shape required by this runtime.", payloadType: "markless/state", payloadScript: "script[type=\\"markless/state\\"]", suggestions: [{ message: "Regenerate the markless/state payload with the matching markless compiler/runtime version." }], docsUrl: "https://markless.dev/errors/MARKLESS_PAYLOAD_INVALID", site }); }',
		'function marklessScalarEscalate(site) { throw Object.assign(new Error("MARKLESS_SCALAR_SPECIALIZED_ESCALATE"), { code: "MARKLESS_SCALAR_SPECIALIZED_ESCALATE", site }); }',
		'function resolve(value) { return value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function" ? value : Promise.resolve(value); }',
	].join('\n');
}

function emitScalarAction(action: ScalarSpecialization, loadSymbolName: string): string {
	return [
		`async function ${action.name}(input) {`,
		`	const cell = payloadState.cells[${action.cellIndex}];`,
		`	marklessAssertScalarCell(cell, ${JSON.stringify(action.cell)}, ${JSON.stringify(`markless/state cell[${action.cellIndex}]`)});`,
		`	const host = marklessFindElementAtDomOrderIndex(input.root, ${action.hostIndex}, ${JSON.stringify(action.hostTagName)}) ?? input.element ?? input.event.target;`,
		'	if (!host) return marklessScalarSpecializedFallback(input, "host");',
		...action.textUpdates.map((update, index) =>
			`	const textTarget${index} = marklessFindElementAtDomOrderIndex(input.root, ${update.index}, ${JSON.stringify(update.tagName)});`,
		),
		...action.textUpdates.map((_, index) => `	if (!textTarget${index}) return marklessScalarSpecializedFallback(input, "text-target");`),
		`	let value = marklessDecodeScalarSlot(cell.value.root), dirty = false;`,
		'	const graph = {',
		`		hasCell(graphNodeId) { return graphNodeId === ${JSON.stringify(action.cell)}; },`,
		`		read(graphNodeId, path = []) { if (graphNodeId !== ${JSON.stringify(action.cell)} || path.length) return marklessScalarEscalate("read"); return value; },`,
		`		write(write) { if (write.graphNodeId !== ${JSON.stringify(action.cell)} || (write.path?.length ?? 0)) return marklessScalarEscalate("write"); if (!Object.is(value, write.value)) { value = write.value; dirty = true; } },`,
		`		update(update) { if (update.graphNodeId !== ${JSON.stringify(action.cell)} || (update.path?.length ?? 0)) return marklessScalarEscalate("update"); const previous = value, next = update.update(previous); if (!Object.is(previous, next)) { value = next; dirty = true; } return update.returnValue === "previous" ? previous : update.returnValue === "next" ? next : undefined; },`,
		'		call() { return marklessScalarEscalate("call"); },',
		'		async flush() {',
		'			if (!dirty) return;',
		'			dirty = false;',
		...action.textUpdates.map((update, index) =>
			`			textTarget${index}.textContent = marklessUpdateText({ domUpdate: { hostNodeId: ${JSON.stringify(update.hostNodeId)} }, value: ${JSON.stringify(update.prefix ?? '')} + marklessScalarSlotText(value) }, ${JSON.stringify(update.hostNodeId)}).value;`,
		),
		'		},',
		'	};',
		...(action.syncPolicy
			? [
					`	const syncPolicy = input.eventRecord?.syncPolicy ?? ${JSON.stringify(action.syncPolicy)};`,
					'	if (syncPolicy && !input.syncPolicyAlreadyApplied) {',
					"		const { runSyncPolicyActions } = await import('@markless/web/inline/sync-policy-core');",
					'		runSyncPolicyActions(syncPolicy, graph, input.event);',
					'	}',
				]
			: []),
		...emitScalarWrite(action),
		`	const symbol = await resolve(${loadSymbolName}(${JSON.stringify(action.symbolId)}));`,
		'	await resolve(symbol({ graph: { ...graph, write() {}, update(update) { const current = graph.read(update.graphNodeId, update.path ?? []); return update.returnValue === "previous" || update.returnValue === "next" ? current : undefined; } }, event: input.event, element: host, getElementHandle: () => undefined }));',
		'	await graph.flush();',
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
