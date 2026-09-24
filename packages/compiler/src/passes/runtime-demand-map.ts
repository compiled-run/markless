import type {
	CaptureAnalysisArtifact,
	GeneratedSymbolModule,
	ModuleGraphInterfaceArtifact,
	ModuleGraphInterfaceFirstUseReach,
	PublicRenderModuleArtifact,
	PlannedSymbol,
	RuntimeDemandMapActionPlan,
	RuntimeDemandMapAction,
	RuntimeDemandMapArtifact,
	RuntimeDemandMapClosurePlan,
	RuntimeDemandMapFirstUse,
	RuntimeDemandMapFirstUseCall,
	RuntimeDemandMapFirstUsePage,
	RuntimeDemandMapFirstUseReach,
	RuntimeDemandMapPassedProp,
	RuntimeDemandMapRecord,
	RuntimeDemandMapRecordKind,
	RuntimeDemandClass,
	SemanticComponent,
	SemanticComponentEdge,
	SemanticComponentPropBinding,
	SemanticGraphBinding,
	SemanticSharedCallbackBinding,
	SymbolModulesArtifact,
	SymbolResolverPlan,
} from '../artifacts.ts';
import {
	ASYNC_PROTOCOL_VERSION,
	PROTOCOL_EVENT_ACTION_KIND,
	PROTOCOL_PAGE_SPACE_ID_PREFIXES,
	PROTOCOL_VISIBLE_EVENT_NAME,
	protocolEventActionKind,
	type ProtocolArmBranchRecord,
	type ProtocolArmRecordSet,
	type ProtocolEventActionKind,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer';
import { LEAN_DISPATCH_MARKER_MODULES } from '../lean-dispatch-modules.ts';
import { closureActionPlan } from './closure-action-plan.ts';
import { PROJECTION_PROP_NAME } from './public-render/shared-seed-pass.ts';
import {
	isSharedCallbackSlotGraphNodeId,
	sharedCallbackSlotGraphNodeId,
} from './semantic-graph/collect-shared.ts';

const DISPATCH_CORE_COMMON = [
	'web/resume-runtime',
	'web/resume-runtime-shared',
	'web/resume-runtime-start',
	'web/resume-events',
	'web/resume-locators',
	'web/payload-resume',
	'web/payload-graph-construct',
	// Error enrichment is dispatch infrastructure (T012): loaded by the shared
	// runtime on any dispatch path, not a capability.
	'web/runtime-error-reporting',
	// Payload resume applies every dispatch's DOM writes through the journal.
	'web/dom-journal',
];
const SCALAR_LEAN_DISPATCH_CORE = [
	'web/fns/dom-order',
	'web/fns/write-scalar',
	'web/fns/update-text',
	'web/runtime-error-reporting',
	// Tiny generic helpers for emitted scalar dispatchers: DOM-order lookup,
	// scalar-cell decode/validation, and fail-closed error creation.
	...LEAN_DISPATCH_MARKER_MODULES.scalar,
];
const ROW_LEAN_DISPATCH_CORE = [
	...LEAN_DISPATCH_MARKER_MODULES.row,
	'web/event-only-lean/lean-shared',
];
const CLOSURE_DISPATCH_CORE = [...SCALAR_LEAN_DISPATCH_CORE, 'web/fns/closure-action'];
const SYNC_POLICY = ['web/inline/sync-policy-core'];
const DOM_UPDATE: string[] = [];
const KEYED_REPEAT = ['web/repeat-runtime', 'web/resume-keyed-repeats'];
const BRANCH = ['web/resume-branches'];
// Settle tracking, the re-settle hold and streamed-arm adoption load only for async boundaries.
const ASYNC_BOUNDARY = [
	'web/resume-async-boundaries',
	'web/resume-async-wiring',
	'web/resume-resettle-hold',
	'web/resume-stream-patches',
];
const BEHAVIOR = ['web/resume-behaviors'];
// Capabilities whose demand `capabilityModuleIds` enumerates for the whole module, arms and rows included.
export const RUNTIME_CAPABILITY_MODULE_IDS: ReadonlyArray<string> = [
	...BEHAVIOR,
	...ASYNC_BOUNDARY,
];
// The overlay behaviour. Recording the demand here is what makes it emittable at
// all: no module the runtime always loads may write the `import()` specifier, or
// every app would ship the chunk, so the app's own emitted module writes it and
// this record is what tells the bundler to.
const OVERLAY = ['web/fns/overlay'];
// The node-BUILDING half of a keyed repeat, folded into the record that can
// reach it. A record carrying neither `rowTemplate` nor `emptyArm` cannot mint a
// row or raise an `@empty` arm at all, so recording the demand per record is
// what lets the bundler keep the chunk off every app whose repeats only reorder.
const ROW_MINT = ['web/fns/row-mint'];
// The component-rooted half of the same building step. It reaches the render
// closure, so it is folded per record for the same reason: an app whose rows
// root no component never names it and never emits its chunk.
const ROW_COMPONENT_MINT = ['web/fns/row-component-mint'];
// The template mint plus the page's render-data reader, for a row with expression slots.
const ROW_SLOT_MINT = ['web/fns/row-slot-mint'];
// Per-enclosing-row wiring, folded only into a repeat written inside another's rows.
const NESTED_REPEATS = ['web/fns/nested-repeats'];
const FULL_RESUME_CORE = ['web/resume-locators'];
const FULL_TIER_COMMON = [
	'web/resume-runtime',
	'web/resume-runtime-shared',
	'web/resume-runtime-start',
	'web/resume-events',
	'web/payload-resume',
	'web/payload-graph-construct',
	'web/dom-journal',
];

function payloadResumeModules(storageFree: boolean): string[] {
	return storageFree
		? [
				'core/web/resume-storage-free',
				// 'web/resume-storage-free' does not exist as a source module (ids derive
				// from source paths); resume-core preload is covered by payload-resume's
				// static-import closure. Critique finding 2026-08-01.
				'web/payload-full-storage-free',
			]
		: ['core/web/resume', 'web/resume', 'web/payload-full'];
}
const RECORD_KINDS = [
	'async-boundary',
	'behavior',
	'branch',
	'dom-update',
	'element-handle',
	PROTOCOL_EVENT_ACTION_KIND.event,
	PROTOCOL_EVENT_ACTION_KIND.externalDelegate,
	'keyed-repeat',
	'overlay',
] as const satisfies ReadonlyArray<RuntimeDemandMapRecordKind>;

const RUNTIME_DEMAND_CLASSIFIER = {
	'plain-ssr': { scalarEvents: true, scalarRows: true },
	prerender: { scalarEvents: false, scalarRows: false },
} as const satisfies Record<
	RuntimeDemandClass,
	{ readonly scalarEvents: boolean; readonly scalarRows: boolean }
>;

const EVENT_ACTION_PHASES = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: { payloadRuntime: true },
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: { payloadRuntime: false },
} as const satisfies Record<ProtocolEventActionKind, { readonly payloadRuntime: boolean }>;

export function createRuntimeDemandMap(
	input: {
		readonly symbolResolver: SymbolResolverPlan;
		readonly captureAnalysis?: CaptureAnalysisArtifact;
		readonly symbolModules: SymbolModulesArtifact;
		readonly publicRenderModule: PublicRenderModuleArtifact;
		readonly protocolView: ProtocolViewPayload;
		readonly protocolState: ProtocolStatePayload;
		// Elevation is a compile-time fact about the emitted markup, not a runtime
		// record: the behaviour reads the mark off the DOM, so the payload carries no
		// overlay record and this is the only place the demand can come from.
		readonly overlays?: ReadonlyArray<{ readonly hostNodeId: string }>;
		// Props cross into a child's own records, which this file's view cannot see.
		readonly componentEdges?: unknown;
		readonly graphBindings?: ReadonlyArray<SemanticGraphBinding>;
		// The composed children's interfaces, keyed by import source.
		readonly importedModuleInterfaces?: Readonly<Record<string, ModuleGraphInterfaceArtifact>>;
		// This module's own components, so a same-module edge can name its child.
		readonly components?: ReadonlyArray<SemanticComponent>;
		readonly sharedCallbackBindings?: ReadonlyArray<SemanticSharedCallbackBinding>;
	},
	demandClass: RuntimeDemandClass,
): RuntimeDemandMapArtifact {
	const storageRequiresFullResume = (input.protocolState.storage?.length ?? 0) > 0;
	const storageFreePayload = input.protocolState.version === ASYNC_PROTOCOL_VERSION;
	const dispatchCore = [...payloadResumeModules(storageFreePayload), ...DISPATCH_CORE_COMMON];
	const fullTier = [...payloadResumeModules(storageFreePayload), ...FULL_TIER_COMMON];
	const emittedModules = new Map(
		input.symbolModules.modules.map((module) => [module.symbolId, module]),
	);
	const renderRuntimeModuleIds = runtimeModuleIdsFromSources([
		input.publicRenderModule.moduleSource,
		input.publicRenderModule.ssrModuleSource,
	]);
	const symbols = input.symbolResolver.symbols.map((symbol) => ({
		symbolId: symbol.id,
		kind: symbol.kind,
		runtimeModuleIds: runtimeModuleIdsForSymbol(symbol, emittedModules.get(symbol.id)),
	}));
	const symbolDemand = new Map(
		symbols.map((symbol) => [symbol.symbolId, symbol.runtimeModuleIds]),
	);
	const closedSymbolDemand = transitiveSymbolDemand(symbolDemand, input.captureAnalysis);
	const scalarEventKeys = scalarCoreEventKeys(
		input.symbolResolver,
		input.protocolView,
		input.protocolState,
		input.componentEdges,
		input.captureAnalysis,
	);
	const classRouting = RUNTIME_DEMAND_CLASSIFIER[demandClass];
	// The overlay behaviour installs only from full resume's start, which a closure never reaches.
	const closurePlans =
		classRouting.scalarEvents &&
		!storageRequiresFullResume &&
		(input.overlays ?? []).length === 0
			? closureEventPlans(input, scalarEventKeys, emittedModules)
			: new Map<string, RuntimeDemandMapClosurePlan>();
	const scalarEvents =
		classRouting.scalarEvents &&
		!storageRequiresFullResume &&
		(scalarEventKeys.size > 0 || closurePlans.size > 0);
	const scalarRows =
		classRouting.scalarRows &&
		!storageRequiresFullResume &&
		isScalarOnlyKeyedRepeatModule(input.symbolResolver, input.protocolView);
	const payloadRecords = payloadDemandRecords(
		input.protocolView,
		closedSymbolDemand,
		renderRuntimeModuleIds,
		{
			scalarEventKeys: scalarEvents ? scalarEventKeys : new Set(),
			closureEventKeys: new Set(closurePlans.keys()),
			scalarRows,
		},
		dispatchCore,
		fullTier,
		input.overlays ?? [],
	);
	const scope: FirstUseScope = {
		resolver: input.symbolResolver,
		view: input.protocolView,
		state: input.protocolState,
		records: payloadRecords,
		symbolDemand: closedSymbolDemand,
		captureAnalysis: input.captureAnalysis,
		...firstUseComposition(input),
	};
	return {
		passId: 'runtime-demand-map',
		version: 1,
		recordKinds: recordKindPhases({ scalarEvents, scalarRows }),
		symbols,
		payloadRecords,
		actions: actionDemandRecords(
			scope,
			scalarEvents ? scalarEventKeys : new Set(),
			scalarRows,
			closurePlans,
		),
		capabilityModuleIds: capabilityModuleIds(input.symbolResolver, input.protocolView),
		unknownRecordModuleIds: unique([
			...dispatchCore,
			...(classRouting.scalarEvents ? CLOSURE_DISPATCH_CORE : []),
			...(classRouting.scalarRows ? ROW_LEAN_DISPATCH_CORE : []),
			...SYNC_POLICY,
			...DOM_UPDATE,
			'web/dom-update',
			'web/dom-journal',
			...KEYED_REPEAT,
			...BRANCH,
			...ASYNC_BOUNDARY,
			...BEHAVIOR,
			// Conditional, unlike the kinds above: the overlay behaviour is only
			// reachable in an app that compiled a mark, so listing it unconditionally
			// would let the execution oracle excuse it everywhere.
			...((input.overlays ?? []).length > 0 ? OVERLAY : []),
			...FULL_RESUME_CORE,
			...fullTier,
		]),
		firstUsePage: firstUsePage(scope),
	};
}

function firstUseComposition(
	input: Parameters<typeof createRuntimeDemandMap>[0],
): Pick<
	FirstUseScope,
	| 'componentEdges'
	| 'graphBindings'
	| 'importedModuleInterfaces'
	| 'components'
	| 'sharedCallbackBindings'
> {
	return {
		componentEdges: Array.isArray(input.componentEdges)
			? (input.componentEdges as ReadonlyArray<SemanticComponentEdge>)
			: [],
		graphBindings: input.graphBindings ?? [],
		importedModuleInterfaces: input.importedModuleInterfaces,
		components: input.components ?? [],
		sharedCallbackBindings: input.sharedCallbackBindings ?? [],
	};
}

/** The scope a module's own first-use answers are computed in, for publishing on its interface. */
export function firstUseScope(
	input: Parameters<typeof createRuntimeDemandMap>[0],
	map: RuntimeDemandMapArtifact,
): FirstUseScope {
	return {
		resolver: input.symbolResolver,
		view: input.protocolView,
		state: input.protocolState,
		records: map.payloadRecords,
		symbolDemand: transitiveSymbolDemand(
			new Map(map.symbols.map((symbol) => [symbol.symbolId, symbol.runtimeModuleIds])),
			input.captureAnalysis,
		),
		captureAnalysis: input.captureAnalysis,
		...firstUseComposition(input),
	};
}

// Actions the scalar leaf cannot take whose whole closure still compiles.
function closureEventPlans(
	input: Parameters<typeof createRuntimeDemandMap>[0],
	scalarEventKeys: ReadonlySet<string>,
	symbolModules: ReadonlyMap<string, GeneratedSymbolModule>,
): Map<string, RuntimeDemandMapClosurePlan> {
	const plans = new Map<string, RuntimeDemandMapClosurePlan>();
	const view = input.protocolView;
	const rowSymbolIds = new Set(
		(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.flatMap((event) => event.symbolIds ?? []),
		),
	);
	for (const event of view.events ?? []) {
		const key = eventKey(event.hostNodeId, event.eventName);
		if (scalarEventKeys.has(key)) continue;
		const plan = closureActionPlan(
			{
				resolver: input.symbolResolver,
				view,
				state: input.protocolState,
				componentEdges: input.componentEdges,
				symbolModules,
				...(input.graphBindings ? { graphBindings: input.graphBindings } : {}),
				rowSymbolIds,
				transitiveSymbolIds: (symbolIds) =>
					transitiveSymbolIds(symbolIds, input.captureAnalysis),
			},
			event,
		);
		if (plan) plans.set(key, plan);
	}
	return plans;
}

// Arm and row records ride outside the flat payload streams, but every one of them is planned as a symbol.
function capabilityModuleIds(
	resolver: SymbolResolverPlan,
	view: ProtocolViewPayload,
): ReadonlyArray<string> {
	const symbols = resolver.symbols;
	const behavior =
		symbols.some(
			(symbol) =>
				symbol.kind === 'behavior' ||
				(symbol.kind === 'event-handler' &&
					symbol.eventName === PROTOCOL_VISIBLE_EVENT_NAME),
		) || (view.events ?? []).some((event) => event.eventName === PROTOCOL_VISIBLE_EVENT_NAME);
	const asyncBoundary =
		(view.asyncBoundaries?.length ?? 0) > 0 ||
		symbols.some(
			(symbol) =>
				symbol.kind === 'async-computed-runner' || symbol.kind === 'async-boundary-update',
		);
	return [...(behavior ? BEHAVIOR : []), ...(asyncBoundary ? ASYNC_BOUNDARY : [])];
}

function recordKindPhases(input: {
	readonly scalarEvents: boolean;
	readonly scalarRows: boolean;
}): RuntimeDemandMapArtifact['recordKinds'] {
	return RECORD_KINDS.map((kind) => ({
		kind,
		replaced:
			(input.scalarEvents && (kind === 'event' || kind === 'dom-update')) ||
			(input.scalarRows && (kind === 'keyed-repeat' || kind === 'dom-update')),
	}));
}

// Eligibility is per action: the rest of the page keeps full resume, which adopts the live cell.
function scalarCoreEventKeys(
	resolver: SymbolResolverPlan,
	view: ProtocolViewPayload,
	state: ProtocolStatePayload,
	componentEdges: unknown,
	captureAnalysis?: CaptureAnalysisArtifact,
): ReadonlySet<string> {
	if ((view.events?.length ?? 0) === 0 || (view.domUpdates?.length ?? 0) === 0) return new Set();

	const symbolsById = new Map(resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const rowSymbolIds = new Set(
		(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.flatMap((event) => event.symbolIds ?? []),
		),
	);
	return new Set(
		(view.events ?? [])
			.filter(
				(event) =>
					protocolEventActionKind(event) === PROTOCOL_EVENT_ACTION_KIND.event &&
					transitiveSymbolIds(event.symbolIds ?? [], captureAnalysis).length ===
						(event.symbolIds ?? []).length &&
					(event.symbolIds ?? []).length === 1 &&
					!(event.symbolIds ?? []).some((symbolId) => rowSymbolIds.has(symbolId)) &&
					(event.symbolIds ?? []).every((symbolId) => {
						const symbol = symbolsById.get(symbolId);
						return (
							symbol?.kind === 'event-handler' &&
							isScalarWriteOnlyEventSymbol(symbol) &&
							!hostCarriesRuntimeRecords(event.hostNodeId, view) &&
							!cellReadOutsideTextUpdates(
								symbol.writes?.[0]?.graphNodeId,
								view,
								state,
								componentEdges,
							) &&
							syncPolicyGraphNodeIds(event.syncPolicy).every(
								(graphNodeId) => graphNodeId === symbol.writes?.[0]?.graphNodeId,
							) &&
							!writesDemandNonTextRuntime(symbol.writes ?? [], view) &&
							textDomUpdatesForWrites(symbol.writes ?? [], view).every((update) => {
								const updateSymbol = update.symbolId
									? symbolsById.get(update.symbolId)
									: undefined;
								return (
									updateSymbol?.kind === 'dom-update' &&
									isScalarTextUpdateSymbol(updateSymbol)
								);
							})
						);
					}),
			)
			.map((event) => eventKey(event.hostNodeId, event.eventName)),
	);
}

function hostCarriesRuntimeRecords(hostNodeId: string, view: ProtocolViewPayload): boolean {
	return (
		(view.elementHandles ?? []).some((handle) => handle.hostNodeId === hostNodeId) ||
		(view.behaviors ?? []).some((behavior) => behavior.hostNodeId === hostNodeId)
	);
}

// Fail closed: any reader of the cell besides its top-level text updates needs the full graph.
function cellReadOutsideTextUpdates(
	graphNodeId: string | undefined,
	view: ProtocolViewPayload,
	state: ProtocolStatePayload,
	componentEdges: unknown,
): boolean {
	if (!graphNodeId) return true;
	const { cells: _cells, ...stateReaders } = state;
	const { events: _events, domUpdates: _domUpdates, locators: _locators, ...viewReaders } = view;
	return (
		referencesValue(stateReaders, graphNodeId) ||
		referencesValue(viewReaders, graphNodeId) ||
		referencesValue(componentEdges, graphNodeId)
	);
}

function referencesValue(value: unknown, id: string): boolean {
	if (value === id) return true;
	if (!value || typeof value !== 'object') return false;
	return Object.values(value).some((child) => referencesValue(child, id));
}

function isScalarOnlyKeyedRepeatModule(
	resolver: SymbolResolverPlan,
	view: ProtocolViewPayload,
): boolean {
	if ((view.keyedRepeats?.length ?? 0) === 0 || (view.domUpdates?.length ?? 0) === 0)
		return false;
	if ((view.branches?.length ?? 0) > 0) return false;
	if ((view.asyncBoundaries?.length ?? 0) > 0) return false;
	if ((view.behaviors?.length ?? 0) > 0) return false;
	if ((view.elementHandles?.length ?? 0) > 0) return false;
	const symbolsById = new Map(resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const rowEvents = (view.keyedRepeats ?? []).flatMap((repeat) =>
		repeat.rowEvents.map((event) => ({ repeat, event })),
	);
	if (rowEvents.length === 0) return false;
	for (const { repeat, event } of rowEvents) {
		if (repeat.enclosingRow) return false;
		const eventSymbols = (event.symbolIds ?? []).map((symbolId) => symbolsById.get(symbolId));
		if (eventSymbols.length !== 1) return false;
		if (
			!eventSymbols.every(
				(symbol) =>
					symbol?.kind === 'event-handler' &&
					isScalarWriteOnlyEventSymbol(symbol, new Set([repeat.itemName])) &&
					!(symbol.writes ?? []).some(
						(write) => write.graphNodeId === repeat.collectionGraphNodeId,
					),
			)
		)
			return false;
		const writes = eventSymbols.flatMap((symbol) =>
			symbol?.kind === 'event-handler' ? (symbol.writes ?? []) : [],
		);
		if (writes.length === 0) return false;
		if (writesDemandNonTextRuntime(writes, view)) return false;
		const domUpdateSymbolIds = textDomUpdatesForWrites(writes, view).map(
			(update) => update.symbolId,
		);
		if (domUpdateSymbolIds.length === 0 || domUpdateSymbolIds.some((symbolId) => !symbolId))
			return false;
		if (
			!domUpdateSymbolIds.every((symbolId) => {
				const symbol = symbolsById.get(symbolId!);
				return symbol?.kind === 'dom-update' && isScalarTextUpdateSymbol(symbol);
			})
		)
			return false;
	}
	return true;
}

function isScalarWriteOnlyEventSymbol(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	localNames: ReadonlySet<string> = new Set(),
): boolean {
	if ((symbol.writes ?? []).length !== 1) return false;
	if (
		(symbol.moduleImports ?? []).length > 0 ||
		(symbol.elementHandleCalls ?? []).length > 0 ||
		// A handle read needs the resume registry, so this is no scalar leaf.
		(symbol.elementHandleReads ?? []).length > 0
	)
		return false;
	const write = symbol.writes?.[0];
	if (!write || write.row || write.path.length !== 0) return false;
	if (write.operation === 'update')
		return !!write.updateOperator && eventHandlerBodyAllowsScalarLeaf(symbol, write);
	if (write.operation !== 'assign' || write.assignmentOperator) return false;
	if (
		literalValueSource(write.valueSource) === null &&
		!localPathValueSource(write.valueSource, localNames)
	) {
		return false;
	}
	return eventHandlerBodyAllowsScalarLeaf(symbol, write);
}

function isScalarTextUpdateSymbol(
	symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>,
): boolean {
	const target = symbol.target;
	return (
		target?.kind === 'text' &&
		target.trueValue === undefined &&
		target.falseValue === undefined
	);
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

function eventHandlerBodyAllowsScalarLeaf(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	write: NonNullable<
		Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']
	>[number],
): boolean {
	const body = eventHandlerBodySource(symbol.source);
	const authoredWrite = authoredWriteSource(write);
	if (!body || !authoredWrite) return false;
	let remainder = body.replace(authoredWrite, '');
	for (const parameter of symbol.parameters) {
		remainder = remainder.replaceAll(`${parameter}.preventDefault();`, '');
		remainder = remainder.replaceAll(`${parameter}.stopPropagation();`, '');
	}
	remainder = remainder.replace(/\breturn\b/g, '');
	return remainder.replace(/[;\s]/g, '') === '';
}

function eventHandlerBodySource(source: string): string | null {
	const arrowIndex = source.indexOf('=>');
	if (arrowIndex === -1) return null;

	const bodyStart = arrowIndex + 2 + leadingWhitespaceLength(source.slice(arrowIndex + 2));
	if (bodyStart >= source.length) return null;

	if (source[bodyStart] === '{') {
		const bodyEnd = source.lastIndexOf('}');
		if (bodyEnd === -1) return null;
		return source.slice(bodyStart + 1, bodyEnd).trim();
	}

	return `return ${source.slice(bodyStart).trim()};`;
}

function authoredWriteSource(
	write: NonNullable<
		Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']
	>[number],
): string | null {
	if (write.operation === 'assign') {
		const operator = write.assignmentOperator ?? '=';
		if (!write.valueSource) return null;
		return `${write.source} ${operator} ${write.valueSource}`;
	}

	if (write.operation === 'update' && write.updateOperator) {
		return write.prefix
			? `${write.updateOperator}${write.source}`
			: `${write.source}${write.updateOperator}`;
	}

	return null;
}

function leadingWhitespaceLength(source: string): number {
	const match = /^\s*/.exec(source);
	return match ? match[0].length : 0;
}

function literalValueSource(source: string | undefined): string | null {
	if (!source) return null;
	const trimmed = source.trim();
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
	if (
		trimmed === 'true' ||
		trimmed === 'false' ||
		trimmed === 'null' ||
		trimmed === 'undefined'
	) {
		return trimmed;
	}
	if (
		(trimmed.startsWith("'") && trimmed.endsWith("'")) ||
		(trimmed.startsWith('"') && trimmed.endsWith('"'))
	) {
		return JSON.stringify(trimmed.slice(1, -1));
	}
	return null;
}

function localPathValueSource(
	source: string | undefined,
	localNames: ReadonlySet<string>,
): boolean {
	const parts = source?.trim().split('.') ?? [];
	return parts.length >= 2 && parts.every(isIdentifier) && localNames.has(parts[0] ?? '');
}

function localValuePath(
	source: string | undefined,
	localNames: ReadonlySet<string>,
): ReadonlyArray<string> | null {
	const parts = source?.trim().split('.') ?? [];
	return parts.length >= 2 && parts.every(isIdentifier) && localNames.has(parts[0] ?? '')
		? parts
		: null;
}

function literalPlanValue(source: string | undefined): unknown {
	const literal = literalValueSource(source);
	if (literal === null) return undefined;
	return JSON.parse(literal);
}

function writesDemandNonTextRuntime(
	writes: ReadonlyArray<
		NonNullable<Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']>[number]
	>,
	view: ProtocolViewPayload,
): boolean {
	return writes.some(
		(write) =>
			(view.asyncBoundaries ?? []).some((boundary) =>
				boundary.asyncReads.some(
					(read) =>
						read.graphNodeId === write.graphNodeId &&
						startsWithPath(read.path, write.path),
				),
			) ||
			(view.branches ?? []).some((branch) =>
				(branch.testReads ?? []).some(
					(read) =>
						read.graphNodeId === write.graphNodeId &&
						startsWithPath(read.path, write.path),
				),
			) ||
			(view.behaviors ?? []).some((behavior) =>
				(behavior.inputGraphReads ?? []).some(
					(read) =>
						read.graphNodeId === write.graphNodeId &&
						startsWithPath(read.path, write.path),
				),
			) ||
			(view.domUpdates ?? []).some(
				(update) =>
					update.graphNodeId === write.graphNodeId &&
					startsWithPath(update.path, write.path) &&
					update.target?.kind !== 'text',
			) ||
			!(view.domUpdates ?? []).some(
				(update) =>
					update.graphNodeId === write.graphNodeId &&
					startsWithPath(update.path, write.path) &&
					update.target?.kind === 'text',
			),
	);
}

function textDomUpdatesForWrites(
	writes: ReadonlyArray<
		NonNullable<Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']>[number]
	>,
	view: ProtocolViewPayload,
): ProtocolViewPayload['domUpdates'] {
	return (view.domUpdates ?? []).filter(
		(update) =>
			update.target?.kind === 'text' &&
			writes.some(
				(write) =>
					update.graphNodeId === write.graphNodeId &&
					startsWithPath(update.path, write.path),
			),
	);
}

function isIdentifier(value: string): boolean {
	return /^[A-Za-z_$][\w$]*$/.test(value);
}

function runtimeModuleIdsForSymbol(
	_symbol: PlannedSymbol,
	module: GeneratedSymbolModule | undefined,
): ReadonlyArray<string> {
	if (!module) return [];
	return runtimeModuleIdsFromSources([module.source]);
}

function runtimeModuleIdsFromSources(sources: ReadonlyArray<string>): ReadonlyArray<string> {
	return unique(
		sources.flatMap((source) =>
			[...source.matchAll(/from ['"]@markless\/web\/fns\/([^'"]+)['"]/g)].map(
				(match) => `web/fns/${match[1]}`,
			),
		),
	);
}

function payloadDemandRecords(
	view: ProtocolViewPayload,
	symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>,
	renderRuntimeModuleIds: ReadonlyArray<string>,
	replacement: {
		readonly scalarEventKeys: ReadonlySet<string>;
		readonly closureEventKeys: ReadonlySet<string>;
		readonly scalarRows: boolean;
	},
	dispatchCore: ReadonlyArray<string>,
	fullTier: ReadonlyArray<string>,
	overlays: ReadonlyArray<{ readonly hostNodeId: string }>,
): RuntimeDemandMapArtifact['payloadRecords'] {
	const rowDispatchCore = replacement.scalarRows ? ROW_LEAN_DISPATCH_CORE : fullTier;
	return [
		...(view.events ?? []).map((event): RuntimeDemandMapRecord => {
			const kind = protocolEventActionKind(event);
			const phase = EVENT_ACTION_PHASES[kind];
			return {
				recordId: `${kind}:${event.hostNodeId}:${event.eventName}`,
				kind,
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				symbolIds: event.symbolIds ?? [],
				runtimeModuleIds: phase.payloadRuntime
					? unique([
							...(replacement.scalarEventKeys.has(
								eventKey(event.hostNodeId, event.eventName),
							)
								? SCALAR_LEAN_DISPATCH_CORE
								: replacement.closureEventKeys.has(
											eventKey(event.hostNodeId, event.eventName),
									  )
									? CLOSURE_DISPATCH_CORE
									: dispatchCore),
							...(event.syncPolicy ? SYNC_POLICY : []),
							// The resume runtime installs the visibility observer at startup.
							...(event.eventName === PROTOCOL_VISIBLE_EVENT_NAME ? BEHAVIOR : []),
							...symbolIdsDemand(event.symbolIds ?? [], symbolDemand),
						])
					: [],
			};
		}),
		...(view.domUpdates ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'dom-update',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...DOM_UPDATE,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.keyedRepeats ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `keyed-repeat:${record.id}`,
			kind: 'keyed-repeat',
			hostNodeId: record.parentHostNodeId,
			runtimeModuleIds: unique([
				...rowDispatchCore,
				...KEYED_REPEAT,
				...(record.rowTemplate ?? record.emptyArm ? ROW_MINT : []),
				...(record.rowComponent ? ROW_COMPONENT_MINT : []),
				...(!record.rowComponent && record.rowTemplate?.componentName ? ROW_SLOT_MINT : []),
				...(record.enclosingRow ? NESTED_REPEATS : []),
				...(replacement.scalarRows ? [] : renderRuntimeModuleIds),
			]),
		})),
		...(view.branches ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `branch:${record.id}`,
			kind: 'branch',
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...BRANCH,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.asyncBoundaries ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `async-boundary:${record.id}`,
			kind: 'async-boundary',
			symbolIds: unique(
				[
					record.updateSymbolId,
					...(record.asyncReads ?? []).map((read) => read.runnerSymbolId),
				].filter((id): id is string => !!id),
			),
			runtimeModuleIds: unique([
				...fullTier,
				...ASYNC_BOUNDARY,
				...symbolIdsDemand(
					[
						record.updateSymbolId,
						...(record.asyncReads ?? []).map((read) => read.runnerSymbolId),
					].filter((id): id is string => !!id),
					symbolDemand,
				),
			]),
		})),
		...(view.behaviors ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `behavior:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'behavior',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...BEHAVIOR,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.elementHandles ?? []).map((record): RuntimeDemandMapRecord => ({
			recordId: `element-handle:${record.hostNodeId}`,
			kind: 'element-handle',
			hostNodeId: record.hostNodeId,
			runtimeModuleIds: FULL_RESUME_CORE,
		})),
		// The behaviour installs from the resume runtime's start, so a marked app
		// demands the full tier with it; the slot is what the app module writes the
		// loader into.
		...overlays.map((record): RuntimeDemandMapRecord => ({
			recordId: `overlay:${record.hostNodeId}`,
			kind: 'overlay',
			hostNodeId: record.hostNodeId,
			runtimeModuleIds: unique([...fullTier, ...OVERLAY]),
		})),
	];
}

function actionDemandRecords(
	scope: FirstUseScope,
	scalarEventKeys: ReadonlySet<string>,
	scalarRows: boolean,
	closurePlans: ReadonlyMap<string, RuntimeDemandMapClosurePlan>,
): RuntimeDemandMapArtifact['actions'] {
	const { resolver, view, records, symbolDemand, captureAnalysis } = scope;
	const firstUse = (symbolIds: ReadonlyArray<string>, ownRecordIds: ReadonlyArray<string>) =>
		firstUseDemand(scope, symbolIds, ownRecordIds);
	const branchDemand = view.branches?.length ? modulesForKind(records, 'branch') : [];
	const branchKinds: RuntimeDemandMapRecordKind[] = view.branches?.length ? ['branch'] : [];
	return [
		...(view.events ?? []).map((event): RuntimeDemandMapAction => {
			const kind = protocolEventActionKind(event);
			if (!EVENT_ACTION_PHASES[kind].payloadRuntime) {
				return {
					hostNodeId: event.hostNodeId,
					eventName: event.eventName,
					recordKind: kind,
					recordKinds: [kind],
					payloadRecordIds: [`${kind}:${event.hostNodeId}:${event.eventName}`],
					runtimeModuleIds: [],
				};
			}
			const subscriberRecords = writeSubscriberRecords(
				resolver,
				transitiveSymbolIds(event.symbolIds ?? [], captureAnalysis),
				view,
				records,
			);
			const plan = scalarEventKeys.has(eventKey(event.hostNodeId, event.eventName))
				? scalarActionPlan(resolver, event, view, subscriberRecords)
				: closurePlans.get(eventKey(event.hostNodeId, event.eventName));
			const reach = firstUse(event.symbolIds ?? [], [
				`${PROTOCOL_EVENT_ACTION_KIND.event}:${event.hostNodeId}:${event.eventName}`,
			]);
			return {
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				recordKind: PROTOCOL_EVENT_ACTION_KIND.event,
				recordKinds: unique([
					PROTOCOL_EVENT_ACTION_KIND.event,
					...branchKinds,
					...subscriberRecords.map((record) => record.kind),
				]),
				payloadRecordIds: unique([
					`${PROTOCOL_EVENT_ACTION_KIND.event}:${event.hostNodeId}:${event.eventName}`,
					...subscriberRecords.map((record) => record.recordId),
				]),
				runtimeModuleIds: unique([
					...recordModules(
						records,
						`${PROTOCOL_EVENT_ACTION_KIND.event}:${event.hostNodeId}:${event.eventName}`,
					),
					...branchDemand,
					...subscriberRecords.flatMap((record) => record.runtimeModuleIds),
				]),
				...(plan ? { plan } : {}),
				firstUse: reach,
			};
		}),
		...(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event): RuntimeDemandMapAction => {
				const subscriberRecords = writeSubscriberRecords(
					resolver,
					transitiveSymbolIds(event.symbolIds ?? [], captureAnalysis),
					view,
					records,
				);
				const eagerBranchKinds = scalarRows ? [] : branchKinds;
				const eagerBranchDemand = scalarRows ? [] : branchDemand;
				const plan = scalarRows
					? rowActionPlan(resolver, repeat, event, view, subscriberRecords)
					: undefined;
				const reach = firstUse(event.symbolIds ?? [], [`keyed-repeat:${repeat.id}`]);
				return {
					hostNodeId: repeat.parentHostNodeId,
					eventName: event.eventName,
					recordKind: 'keyed-repeat-row' as const,
					recordKinds: unique([
						'keyed-repeat',
						...eagerBranchKinds,
						...subscriberRecords.map((record) => record.kind),
					]),
					payloadRecordIds: unique([
						`keyed-repeat:${repeat.id}`,
						...subscriberRecords.map((record) => record.recordId),
					]),
					runtimeModuleIds: unique([
						...recordModules(records, `keyed-repeat:${repeat.id}`),
						...(event.syncPolicy ? SYNC_POLICY : []),
						...symbolIdsDemand(event.symbolIds ?? [], symbolDemand),
						...eagerBranchDemand,
						...subscriberRecords.flatMap((record) => record.runtimeModuleIds),
					]),
					...(plan ? { plan } : {}),
					firstUse: reach,
				};
			}),
		),
	];
}

function scalarActionPlan(
	resolver: SymbolResolverPlan,
	event: ProtocolViewPayload['events'][number],
	view: ProtocolViewPayload,
	records: RuntimeDemandMapArtifact['payloadRecords'],
): RuntimeDemandMapActionPlan | undefined {
	const symbol =
		event.symbolIds.length === 1
			? resolver.symbols.find((candidate) => candidate.id === event.symbolIds[0])
			: undefined;
	if (!symbol || symbol.kind !== 'event-handler') return undefined;
	if (!isScalarWriteOnlyEventSymbol(symbol)) return undefined;
	const write = symbol.writes?.[0];
	if (!write) return undefined;
	if (!textUpdatesUseScalarLeafSymbols(resolver, symbol.writes ?? [], view)) return undefined;
	const textUpdates = planTextUpdates(write.graphNodeId, records, view);
	if (textUpdates.length === 0) return undefined;
	return {
		version: 1,
		kind: 'scalar',
		symbolId: symbol.id,
		cell: write.graphNodeId,
		write: planWriteShape(write, new Set()),
		textUpdates,
	};
}

function rowActionPlan(
	resolver: SymbolResolverPlan,
	repeat: NonNullable<ProtocolViewPayload['keyedRepeats']>[number],
	event: NonNullable<ProtocolViewPayload['keyedRepeats']>[number]['rowEvents'][number],
	view: ProtocolViewPayload,
	records: RuntimeDemandMapArtifact['payloadRecords'],
): RuntimeDemandMapActionPlan | undefined {
	const symbol =
		event.symbolIds.length === 1
			? resolver.symbols.find((candidate) => candidate.id === event.symbolIds[0])
			: undefined;
	if (!symbol || symbol.kind !== 'event-handler') return undefined;
	if (!isScalarWriteOnlyEventSymbol(symbol, new Set([repeat.itemName]))) return undefined;
	const write = symbol.writes?.[0];
	if (!write || !repeat.collectionGraphNodeId) return undefined;
	if (!textUpdatesUseScalarLeafSymbols(resolver, symbol.writes ?? [], view)) return undefined;
	const textUpdates = planTextUpdates(write.graphNodeId, records, view);
	if (textUpdates.length === 0) return undefined;
	return {
		version: 1,
		kind: 'row',
		symbolId: symbol.id,
		cell: write.graphNodeId,
		write: planWriteShape(write, new Set([repeat.itemName])),
		textUpdates,
		repeatId: repeat.id,
		fullDecodeCells: [repeat.collectionGraphNodeId],
	};
}

function planTextUpdates(
	graphNodeId: string,
	records: RuntimeDemandMapArtifact['payloadRecords'],
	view: ProtocolViewPayload,
): RuntimeDemandMapActionPlan['textUpdates'] {
	const recordIds = new Set(records.map((record) => record.recordId));
	return (view.domUpdates ?? []).flatMap((update) => {
		if (
			update.graphNodeId !== graphNodeId ||
			update.target?.kind !== 'text' ||
			!update.symbolId ||
			!recordIds.has(`dom-update:${update.hostNodeId}:${update.symbolId}`)
		)
			return [];
		return [
			{
				hostNodeId: update.hostNodeId,
				graphNodeId: update.graphNodeId,
				symbolId: update.symbolId,
				...(update.target.prefix ? { prefix: update.target.prefix } : {}),
				...(update.target.suffix ? { suffix: update.target.suffix } : {}),
			},
		];
	});
}

function textUpdatesUseScalarLeafSymbols(
	resolver: SymbolResolverPlan,
	writes: ReadonlyArray<
		NonNullable<Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']>[number]
	>,
	view: ProtocolViewPayload,
): boolean {
	const symbolsById = new Map(resolver.symbols.map((symbol) => [symbol.id, symbol]));
	return textDomUpdatesForWrites(writes, view).every((update) => {
		const updateSymbol = update.symbolId ? symbolsById.get(update.symbolId) : undefined;
		return updateSymbol?.kind === 'dom-update' && isScalarTextUpdateSymbol(updateSymbol);
	});
}

function planWriteShape(
	write: NonNullable<
		Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']
	>[number],
	localNames: ReadonlySet<string>,
): RuntimeDemandMapActionPlan['write'] {
	if (write.operation === 'update') {
		return {
			kind: 'update',
			...(write.updateOperator ? { updateOperator: write.updateOperator } : {}),
		};
	}
	const localPath = localValuePath(write.valueSource, localNames);
	if (literalValueSource(write.valueSource) === 'undefined') {
		return { kind: 'assign', valueKind: 'undefined' };
	}
	return {
		kind: 'assign',
		...(localPath ? { localPath } : { value: literalPlanValue(write.valueSource) }),
	};
}

function writeSubscriberRecords(
	resolver: SymbolResolverPlan,
	symbolIds: ReadonlyArray<string>,
	view: ProtocolViewPayload,
	records: RuntimeDemandMapArtifact['payloadRecords'],
): RuntimeDemandMapArtifact['payloadRecords'] {
	const writes = resolver.symbols.flatMap((symbol) =>
		symbolIds.includes(symbol.id) &&
		(symbol.kind === 'event-handler' || symbol.kind === 'callback-prop')
			? (symbol.writes ?? [])
			: [],
	);
	if (writes.length === 0) return [];
	return [
		...records.filter(
			(record) =>
				record.kind === 'dom-update' &&
				view.domUpdates?.some(
					(update) =>
						record.recordId ===
							`dom-update:${update.hostNodeId}:${update.symbolId ?? ''}` &&
						writes.some(
							(write) =>
								write.graphNodeId === update.graphNodeId &&
								startsWithPath(update.path, write.path),
						),
				),
		),
		...records.filter(
			(record) =>
				record.kind === 'async-boundary' &&
				view.asyncBoundaries?.some(
					(boundary) =>
						record.recordId === `async-boundary:${boundary.id}` &&
						boundary.asyncReads.some((read) =>
							writes.some((write) => write.graphNodeId === read.graphNodeId),
						),
				),
		),
	];
}

type AffectedRead = { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> };

type ArmRecordSetLike = {
	readonly events?: ReadonlyArray<{ readonly symbolIds?: ReadonlyArray<string> }>;
	readonly domUpdates?: ReadonlyArray<unknown>;
	readonly behaviors?: ReadonlyArray<unknown>;
	readonly keyedRepeats?: ProtocolArmRecordSet['keyedRepeats'];
	readonly branches?: ReadonlyArray<ProtocolArmBranchRecord>;
};

// Resume start wires every record kind the page holds, whichever action dispatches first.
const RESUME_WIRING = {
	branch: BRANCH,
	'async-boundary': ASYNC_BOUNDARY,
	behavior: BEHAVIOR,
	'element-handle': FULL_RESUME_CORE,
	'keyed-repeat': KEYED_REPEAT,
} as const;

// What one compiled module can see of an action's browser consequences: its own records and the
// interfaces of the components it composes.
export type FirstUseScope = {
	readonly resolver: SymbolResolverPlan;
	readonly view: ProtocolViewPayload;
	readonly state: ProtocolStatePayload;
	readonly records: RuntimeDemandMapArtifact['payloadRecords'];
	readonly symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>;
	readonly captureAnalysis: CaptureAnalysisArtifact | undefined;
	readonly componentEdges: ReadonlyArray<SemanticComponentEdge>;
	readonly graphBindings: ReadonlyArray<SemanticGraphBinding>;
	readonly importedModuleInterfaces:
		| Readonly<Record<string, ModuleGraphInterfaceArtifact>>
		| undefined;
	readonly components: ReadonlyArray<SemanticComponent>;
	readonly sharedCallbackBindings: ReadonlyArray<SemanticSharedCallbackBinding>;
};

// Written paths per graph node; null when the whole node may have changed.
type Affected = Map<string, Array<ReadonlyArray<string>> | null>;

function affect(affected: Affected, graphNodeId: string, path: ReadonlyArray<string> | null) {
	const paths = affected.get(graphNodeId);
	if (paths === null) return false;
	if (path === null) {
		affected.set(graphNodeId, null);
		return true;
	}
	if (paths === undefined) {
		affected.set(graphNodeId, [path]);
		return true;
	}
	if (paths.some((written) => startsWithPath(path, written))) return false;
	paths.push(path);
	return true;
}

function firstUseDemand(
	scope: FirstUseScope,
	handlerSymbolIds: ReadonlyArray<string>,
	ownRecordIds: ReadonlyArray<string>,
): RuntimeDemandMapFirstUseReach {
	const symbolsById = new Map(scope.resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const symbolIds = new Set<string>();
	const affected: Affected = new Map();
	const calls: RuntimeDemandMapFirstUseCall[] = [];
	for (const symbolId of transitiveSymbolIds(handlerSymbolIds, scope.captureAnalysis)) {
		const symbol = symbolsById.get(symbolId);
		if (!symbol) return 'unknown';
		symbolIds.add(symbolId);
		if (symbol.kind !== 'event-handler' && symbol.kind !== 'callback-prop') continue;
		// A foreign body's writes land in another module's graph this map cannot see.
		if (symbol.crossModuleInline) return 'unknown';
		// A prop may hold a composing module's callback: the page's composers answer what it runs.
		for (const read of symbol.reads ?? []) {
			if (!read.graphNodeId.startsWith('prop:')) continue;
			const prop = read.path[0];
			if (prop === undefined) return 'unknown';
			calls.push({ prop });
		}
		const slots = composerSlotCalls(symbolId, scope.captureAnalysis);
		if (slots === 'unknown') return 'unknown';
		calls.push(...slots);
		for (const write of symbol.writes ?? []) {
			// Only a root's seed fills a callback slot; code stored by a handler is unpublished.
			if (isSharedCallbackSlotGraphNodeId(write.graphNodeId)) return 'unknown';
			affect(affected, write.graphNodeId, write.path);
		}
	}
	return consequenceReach(scope, symbolIds, new Set(ownRecordIds), affected, calls);
}

// Resume start derives every served repeat's unserved computed collection, whichever action woke
// it, and whatever reads those collections runs with it.
function resumeStartReach(scope: FirstUseScope): RuntimeDemandMapFirstUseReach {
	const derives = new Set<string>();
	const affected: Affected = new Map();
	for (const repeat of scope.view.keyedRepeats ?? []) {
		const computed = scope.state.computed.find(
			(node) => node.graphNodeId === repeat.collectionGraphNodeId,
		);
		if (computed?.async !== false || !computed.deriveSymbolId) continue;
		derives.add(computed.deriveSymbolId);
		affect(affected, computed.graphNodeId, null);
	}
	const own =
		derives.size === 0
			? { symbolIds: [], runtimeModuleIds: [] }
			: consequenceReach(scope, derives, new Set(), affected);
	if (own === 'unknown') return 'unknown';
	const children = emptyParts();
	for (const edge of scope.componentEdges) {
		if (edge.importSource === undefined) continue;
		const child = importedChildReach(scope, edge);
		if (!child || !mergeChildReach(children, child.reach.resume, child.file)) return 'unknown';
	}
	return unionReach([
		own,
		{
			symbolIds: [],
			runtimeModuleIds: [...children.runtimeModuleIds],
			foreign: [...children.foreign].map(([file, ids]) => ({ file, symbolIds: [...ids] })),
			...linkedParts(children.pageSpaceWrites, children.calls.values()),
		},
	]);
}

// The widget callback slots a symbol invokes; 'unknown' when a capture route reaches composing
// code no page module publishes.
function composerSlotCalls(
	symbolId: string,
	captureAnalysis: CaptureAnalysisArtifact | undefined,
): RuntimeDemandMapFirstUseCall[] | 'unknown' {
	const extracted = captureAnalysis?.extractedSymbols.find(
		(symbol) => symbol.symbolId === symbolId,
	);
	const calls: RuntimeDemandMapFirstUseCall[] = [];
	for (const slot of extracted?.captureSlots ?? [])
		for (const route of slot.routes) {
			if (route.kind === 'widget-callback-route')
				calls.push({
					slot: sharedCallbackSlotGraphNodeId(route.sharedDefinitionId, route.slotName),
				});
			else if (route.kind === 'callback-slot-route') calls.push({ slot: route.graphNodeId });
			else if (route.kind === 'passthrough-route' || route.kind === 'unsupported-opaque')
				return 'unknown';
		}
	return calls;
}

function isPageSpaceGraphNodeId(graphNodeId: string): boolean {
	return PROTOCOL_PAGE_SPACE_ID_PREFIXES.some((prefix) => graphNodeId.startsWith(prefix));
}

type ReachParts = {
	readonly symbolIds: Set<string>;
	readonly recordIds: Set<string>;
	readonly runtimeModuleIds: Set<string>;
	readonly foreign: Map<string, Set<string>>;
	readonly pageSpaceWrites: Set<string>;
	readonly calls: Map<string, RuntimeDemandMapFirstUseCall>;
};

function emptyParts(symbolIds = new Set<string>(), recordIds = new Set<string>()): ReachParts {
	return {
		symbolIds,
		recordIds,
		runtimeModuleIds: new Set(),
		foreign: new Map(),
		pageSpaceWrites: new Set(),
		calls: new Map(),
	};
}

function addCall(
	calls: Map<string, RuntimeDemandMapFirstUseCall>,
	call: RuntimeDemandMapFirstUseCall,
) {
	const key = 'slot' in call ? `slot\0${call.slot}` : `prop\0${call.file ?? ''}\0${call.prop}`;
	calls.set(key, call);
}

// Folds a composed child's reach in: its own symbols belong to its file.
function mergeChildReach(
	parts: ReachParts,
	reach: RuntimeDemandMapFirstUseReach,
	file: string,
): boolean {
	if (reach === 'unknown') return false;
	for (const id of reach.runtimeModuleIds) parts.runtimeModuleIds.add(id);
	for (const entry of [{ file, symbolIds: reach.symbolIds }, ...(reach.foreign ?? [])]) {
		if (entry.symbolIds.length === 0) continue;
		const ids = parts.foreign.get(entry.file) ?? new Set<string>();
		for (const id of entry.symbolIds) ids.add(id);
		parts.foreign.set(entry.file, ids);
	}
	for (const id of reach.pageSpaceWrites ?? []) parts.pageSpaceWrites.add(id);
	for (const call of reach.calls ?? [])
		addCall(parts.calls, 'slot' in call ? call : { file: call.file ?? file, prop: call.prop });
	return true;
}

// Everything a change to `affected` runs in this module and in the components it composes:
// computeds and shared seeds it invalidates, the updates, arms, rows and async settles that read
// them, and each composed child whose props, arm or row it touches.
function consequenceReach(
	scope: FirstUseScope,
	symbolIds: Set<string>,
	recordIds: Set<string>,
	affected: Affected,
	calls: ReadonlyArray<RuntimeDemandMapFirstUseCall> = [],
): RuntimeDemandMapFirstUseReach {
	const { view, state } = scope;
	const reads = (entries: ReadonlyArray<AffectedRead> | undefined) =>
		(entries ?? []).some((entry) => {
			const paths = affected.get(entry.graphNodeId);
			if (paths === undefined) return false;
			if (paths === null || entry.path === undefined) return true;
			const path = entry.path;
			return paths.some(
				(written) => startsWithPath(path, written) || startsWithPath(written, path),
			);
		});
	const branchFlips = (branch: NonNullable<ProtocolViewPayload['branches']>[number]) =>
		reads(branch.testReads) || reads(branch.contentReads);
	const repeatMoves = (repeat: NonNullable<ProtocolViewPayload['keyedRepeats']>[number]) => {
		const slotReads = [
			...(repeat.rowTemplate?.textSlots ?? []),
			...(repeat.rowTemplate?.attributeSlots ?? []),
		].flatMap((slot): ReadonlyArray<AffectedRead> =>
			'graphNodeId' in slot
				? [{ graphNodeId: slot.graphNodeId, path: slot.graphPath }]
				: 'reads' in slot
					? (slot.reads ?? [])
					: [],
		);
		return (
			!repeat.collectionGraphNodeId ||
			reads([{ graphNodeId: repeat.collectionGraphNodeId, path: repeat.collectionPath }]) ||
			reads(slotReads)
		);
	};
	const edgeMounts = (edge: SemanticComponentEdge) =>
		edge.branchScopeIds.some((id) => {
			const branch = view.branches?.find((candidate) => candidate.id === id);
			return !branch || branchFlips(branch);
		}) ||
		edge.keyedRepeatScopeIds.some((id) => {
			const repeat = view.keyedRepeats?.find((candidate) => candidate.id === id);
			return !repeat || repeatMoves(repeat);
		}) ||
		(edge.asyncBoundaryId !== undefined &&
			(view.asyncBoundaries ?? []).some(
				(boundary) => boundary.id === edge.asyncBoundaryId && reads(boundary.asyncReads),
			));
	let mountsLocalChild = false;
	if (affected.size > 0) {
		for (let grew = true; grew;) {
			grew = false;
			for (const node of [...state.computed, ...(state.sharedSeeds ?? [])]) {
				if (affected.has(node.graphNodeId)) continue;
				if (node.dependencies !== undefined && !reads(node.dependencies)) continue;
				affected.set(node.graphNodeId, null);
				grew = true;
			}
			for (const edge of scope.componentEdges) {
				if (edge.importSource !== undefined) continue;
				if (edgeMounts(edge)) {
					mountsLocalChild = true;
					continue;
				}
				const names = changedPropNames(edge, affected, reads);
				if (names.size === 0) continue;
				for (const binding of scope.graphBindings) {
					if (
						binding.kind !== 'prop' ||
						binding.componentName !== edge.childComponentName
					)
						continue;
					for (const name of names)
						if (affect(affected, binding.id, name === ALL_PROPS ? null : [name]))
							grew = true;
				}
			}
		}
		for (const node of [...state.computed, ...(state.sharedSeeds ?? [])])
			if (affected.has(node.graphNodeId) && node.deriveSymbolId)
				symbolIds.add(node.deriveSymbolId);
	}
	const parts = emptyParts(symbolIds, recordIds);
	for (const call of calls) addCall(parts.calls, call);
	for (const graphNodeId of affected.keys())
		if (isPageSpaceGraphNodeId(graphNodeId)) parts.pageSpaceWrites.add(graphNodeId);
	if (mountsLocalChild) return moduleMountReach(scope, parts);
	for (const edge of scope.componentEdges) {
		if (edge.importSource === undefined) continue;
		const mounts = edgeMounts(edge);
		const names = mounts ? new Set<string>() : changedPropNames(edge, affected, reads);
		if (!mounts && names.size === 0) continue;
		const child = importedChildReach(scope, edge);
		if (!child) return 'unknown';
		const { reach, file } = child;
		const picked = mounts
			? [reach.mount]
			: names.has(ALL_PROPS)
				? [reach.otherProps, ...reach.props.map((entry) => entry.reach)]
				: [...names].map(
						(name) =>
							reach.props.find((entry) => entry.name === name)?.reach ??
							reach.otherProps,
					);
		for (const entry of picked) if (!mergeChildReach(parts, entry, file)) return 'unknown';
	}
	for (const update of view.domUpdates ?? [])
		if (reads([update])) {
			recordIds.add(`dom-update:${update.hostNodeId}:${update.symbolId ?? ''}`);
			if (update.symbolId) symbolIds.add(update.symbolId);
		}
	for (const behavior of view.behaviors ?? []) {
		recordIds.add(`behavior:${behavior.hostNodeId}:${behavior.symbolId ?? ''}`);
		if (behavior.symbolId) symbolIds.add(behavior.symbolId);
	}
	const armSymbols = (set: ArmRecordSetLike | undefined): boolean => {
		if (!set) return true;
		for (const event of set.events ?? [])
			for (const id of event.symbolIds ?? []) symbolIds.add(id);
		for (const record of [...(set.domUpdates ?? []), ...(set.behaviors ?? [])]) {
			const symbolId = (record as { readonly symbolId?: unknown }).symbolId;
			if (typeof symbolId === 'string') symbolIds.add(symbolId);
		}
		for (const repeat of set.keyedRepeats ?? [])
			for (const event of repeat.rowEvents)
				for (const id of event.symbolIds ?? []) symbolIds.add(id);
		for (const branch of set.branches ?? []) {
			if (!branch.symbolId) return false;
			symbolIds.add(branch.symbolId);
			for (const arm of branch.armRecords ?? []) if (!armSymbols(arm)) return false;
		}
		return true;
	};
	for (const branch of view.branches ?? []) {
		// Every served arm's behaviors install when resume wires the branch.
		for (const arm of branch.armRecords ?? [])
			for (const behavior of arm.behaviors) {
				const symbolId = (behavior as { readonly symbolId?: unknown }).symbolId;
				if (typeof symbolId === 'string') symbolIds.add(symbolId);
			}
		if (!branchFlips(branch)) continue;
		if (branch.escalates || !branch.symbolId) return 'unknown';
		recordIds.add(`branch:${branch.id}`);
		symbolIds.add(branch.symbolId);
		for (const arm of branch.armRecords ?? []) if (!armSymbols(arm)) return 'unknown';
		if (!armSymbols(branch.servedArmRecords)) return 'unknown';
	}
	for (const repeat of view.keyedRepeats ?? []) {
		if (!recordIds.has(`keyed-repeat:${repeat.id}`) && !repeatMoves(repeat)) continue;
		recordIds.add(`keyed-repeat:${repeat.id}`);
		for (const event of repeat.rowEvents)
			for (const id of event.symbolIds ?? []) symbolIds.add(id);
	}
	for (const boundary of view.asyncBoundaries ?? []) {
		if (!reads(boundary.asyncReads)) continue;
		recordIds.add(`async-boundary:${boundary.id}`);
		if (boundary.updateSymbolId) symbolIds.add(boundary.updateSymbolId);
		for (const read of boundary.asyncReads)
			if (read.runnerSymbolId) symbolIds.add(read.runnerSymbolId);
		const arms = boundary.armRecords;
		for (const arm of Array.isArray(arms) ? arms : arms ? [arms] : [])
			if (!armSymbols(arm as ArmRecordSetLike)) return 'unknown';
	}
	return finishReach(scope, parts);
}

function finishReach(scope: FirstUseScope, parts: ReachParts): RuntimeDemandMapFirstUse {
	const closedSymbolIds = transitiveSymbolIds([...parts.symbolIds], scope.captureAnalysis);
	const wiring = (Object.keys(RESUME_WIRING) as Array<keyof typeof RESUME_WIRING>).flatMap(
		(kind) => (scope.records.some((record) => record.kind === kind) ? RESUME_WIRING[kind] : []),
	);
	const foreign = [...parts.foreign]
		.map(([file, ids]) => ({ file, symbolIds: [...ids].sort() }))
		.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
	return {
		symbolIds: unique(closedSymbolIds),
		runtimeModuleIds: unique([
			...wiring,
			...parts.runtimeModuleIds,
			...[...parts.recordIds].flatMap((recordId) => recordModules(scope.records, recordId)),
			...symbolIdsDemand(closedSymbolIds, scope.symbolDemand),
		]),
		...(foreign.length > 0 ? { foreign } : {}),
		...linkedParts(parts.pageSpaceWrites, parts.calls.values()),
	};
}

function linkedParts(
	pageSpaceWrites: Iterable<string>,
	calls: Iterable<RuntimeDemandMapFirstUseCall>,
): Pick<RuntimeDemandMapFirstUse, 'pageSpaceWrites' | 'calls'> {
	const writes = [...new Set(pageSpaceWrites)].sort();
	const byKey = new Map<string, RuntimeDemandMapFirstUseCall>();
	for (const call of calls) addCall(byKey, call);
	const sorted = [...byKey]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([, call]) => call);
	return {
		...(writes.length > 0 ? { pageSpaceWrites: writes } : {}),
		...(sorted.length > 0 ? { calls: sorted } : {}),
	};
}

// Every symbol and record this module holds, plus every composed child's own instance creation:
// what a new instance of any component here can run in the browser.
function moduleMountReach(
	scope: FirstUseScope,
	parts: ReachParts = emptyParts(),
): RuntimeDemandMapFirstUseReach {
	for (const symbol of scope.resolver.symbols) parts.symbolIds.add(symbol.id);
	for (const record of scope.records) parts.recordIds.add(record.recordId);
	// A new instance seeds its shared state, which every reader of those cells sees.
	for (const seed of scope.state.sharedSeeds ?? [])
		if (isPageSpaceGraphNodeId(seed.graphNodeId)) parts.pageSpaceWrites.add(seed.graphNodeId);
	for (const edge of scope.componentEdges) {
		if (edge.importSource === undefined) continue;
		const child = importedChildReach(scope, edge);
		if (!child || !mergeChildReach(parts, child.reach.mount, child.file)) return 'unknown';
	}
	return finishReach(scope, parts);
}

const ALL_PROPS = '\0all';

// The child's prop names this change can give a new value; ALL_PROPS when it cannot name them.
function changedPropNames(
	edge: SemanticComponentEdge,
	affected: Affected,
	reads: (entries: ReadonlyArray<AffectedRead> | undefined) => boolean,
): Set<string> {
	const names = new Set<string>();
	if (affected.size === 0) return names;
	if (edge.children.childCount > 0) names.add(PROJECTION_PROP_NAME);
	for (const prop of edge.props) {
		switch (prop.kind) {
			case 'graph-reference':
				if (reads([{ graphNodeId: prop.graphNodeId, path: prop.path }]))
					names.add(prop.name);
				break;
			case 'opaque':
				if (!prop.buildTimeValue) names.add(prop.name);
				break;
			case 'spread': {
				const paths = affected.get(prop.graphNodeId);
				if (paths === undefined) break;
				if (paths === null) return new Set([ALL_PROPS]);
				for (const written of paths) {
					if (!startsWithPath(written, prop.path)) {
						if (startsWithPath(prop.path, written)) return new Set([ALL_PROPS]);
						continue;
					}
					const name = written[prop.path.length];
					if (name === undefined) return new Set([ALL_PROPS]);
					if (!prop.excludeNames.includes(name)) names.add(name);
				}
				break;
			}
			case 'callback':
			case 'serializable':
			case 'element-handle-id':
				break;
			default:
				return new Set([ALL_PROPS]);
		}
	}
	return names;
}

function importedChildReach(
	scope: FirstUseScope,
	edge: SemanticComponentEdge,
): { readonly reach: ModuleGraphInterfaceFirstUseReach; readonly file: string } | undefined {
	const moduleInterface =
		edge.importSource === undefined
			? undefined
			: scope.importedModuleInterfaces?.[edge.importSource];
	const reach = moduleInterface?.render.components.find(
		(component) => component.componentName === edge.childComponentName,
	)?.firstUseReach;
	return reach && moduleInterface ? { reach, file: moduleInterface.filename } : undefined;
}

/**
 * What changing each prop of this module's components, or creating an instance of one, runs in
 * the browser. Components of one module share their prop graph nodes, so each answer covers all.
 */
export function componentFirstUseReach(scope: FirstUseScope): ModuleGraphInterfaceFirstUseReach {
	const propBindings = scope.graphBindings.filter((binding) => binding.kind === 'prop');
	const reachFor = (name: string) => {
		const affected: Affected = new Map();
		for (const binding of propBindings) affect(affected, binding.id, [name]);
		return consequenceReach(scope, new Set(), new Set(), affected);
	};
	const names = new Set<string>();
	const collect = (entries: ReadonlyArray<AffectedRead> | undefined) => {
		for (const entry of entries ?? [])
			if (propBindings.some((binding) => binding.id === entry.graphNodeId) && entry.path?.[0])
				names.add(entry.path[0]);
	};
	for (const update of scope.view.domUpdates ?? []) collect([update]);
	for (const branch of scope.view.branches ?? []) {
		collect(branch.testReads);
		collect(branch.contentReads);
	}
	for (const repeat of scope.view.keyedRepeats ?? [])
		if (repeat.collectionGraphNodeId)
			collect([{ graphNodeId: repeat.collectionGraphNodeId, path: repeat.collectionPath }]);
	for (const boundary of scope.view.asyncBoundaries ?? []) collect(boundary.asyncReads);
	for (const node of [...scope.state.computed, ...(scope.state.sharedSeeds ?? [])])
		collect(node.dependencies);
	for (const edge of scope.componentEdges)
		for (const prop of edge.props)
			if (prop.kind === 'graph-reference' || prop.kind === 'spread')
				collect([{ graphNodeId: prop.graphNodeId, path: prop.path }]);
	return {
		props: [...names].sort().map((name) => ({ name, reach: reachFor(name) })),
		// No record names this prop, so only whole-props readers (spreads, rest) can see it.
		otherProps: reachFor(ALL_PROPS),
		mount: moduleMountReach(scope),
		resume: resumeStartReach(scope),
	};
}

// What this module adds to every action's first use on a page it is part of.
function firstUsePage(scope: FirstUseScope): RuntimeDemandMapFirstUsePage {
	const slots = new Map<string, { readonly slot: string; readonly prop: string }>();
	for (const binding of scope.sharedCallbackBindings) {
		const slot = sharedCallbackSlotGraphNodeId(binding.definitionId, binding.slotName);
		slots.set(`${slot}\0${binding.propName}`, { slot, prop: binding.propName });
	}
	return {
		resume: resumeStartReach(scope),
		pageSpaceReaders: [...pageSpaceReads(scope)].sort().map((graphNodeId) => ({
			graphNodeId,
			reach: consequenceReach(scope, new Set(), new Set(), new Map([[graphNodeId, null]])),
		})),
		passedProps: passedProps(scope),
		callbackSlots: [...slots.values()],
	};
}

// Every page-space cell this module's records, state or composed props name.
function pageSpaceReads(scope: FirstUseScope): Set<string> {
	const found = new Set<string>();
	const walk = (value: unknown, key?: string): void => {
		if (typeof value === 'string') {
			if (key !== undefined && /graphNodeId$/i.test(key) && isPageSpaceGraphNodeId(value))
				found.add(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const entry of value) walk(entry, key);
			return;
		}
		if (value && typeof value === 'object')
			for (const [name, entry] of Object.entries(value)) walk(entry, name);
	};
	walk(scope.view);
	walk(scope.state);
	walk(scope.componentEdges);
	return found;
}

// Each prop this module passes that a child could call, with what calling it runs.
function passedProps(scope: FirstUseScope): RuntimeDemandMapPassedProp[] {
	const localComponents = new Set(scope.components.map((component) => component.name));
	const passed: RuntimeDemandMapPassedProp[] = [];
	for (const edge of scope.componentEdges) {
		const file = receivingFile(scope, edge, localComponents);
		const at = file === undefined ? {} : { file };
		for (const prop of edge.props) {
			const reach = passedPropReach(scope, edge, prop);
			if (reach === undefined) continue;
			passed.push(
				prop.kind === 'spread'
					? { ...at, excludeNames: [...prop.excludeNames].sort(), reach }
					: { ...at, prop: prop.name, reach },
			);
		}
	}
	return passed;
}

// The compiled file an edge's component lives in: undefined for this module, null when unnamed.
function receivingFile(
	scope: FirstUseScope,
	edge: SemanticComponentEdge,
	localComponents: ReadonlySet<string>,
): string | null | undefined {
	if (edge.importSource === undefined)
		return localComponents.has(edge.childComponentName) ? undefined : null;
	const moduleInterface = scope.importedModuleInterfaces?.[edge.importSource];
	const known = moduleInterface?.render.components.some(
		(component) => component.componentName === edge.childComponentName,
	);
	return known ? moduleInterface!.filename : null;
}

// Undefined when the passed value can hold no code.
function passedPropReach(
	scope: FirstUseScope,
	edge: SemanticComponentEdge,
	prop: SemanticComponentPropBinding,
): RuntimeDemandMapPassedProp['reach'] | undefined {
	switch (prop.kind) {
		case 'callback': {
			const symbol = scope.resolver.symbols.find(
				(candidate) =>
					candidate.kind === 'callback-prop' &&
					candidate.componentEdgeId === edge.id &&
					candidate.propName === prop.name,
			);
			return symbol ? firstUseDemand(scope, [symbol.id], []) : 'unknown';
		}
		case 'graph-reference':
			if (prop.graphBindingKind === 'element') return undefined;
			if (!prop.graphNodeId.startsWith('prop:') || prop.path[0] === undefined)
				return 'unknown';
			return { symbolIds: [], runtimeModuleIds: [], calls: [{ prop: prop.path[0] }] };
		case 'spread':
			return prop.graphNodeId.startsWith('prop:') && prop.path.length === 0
				? 'same-prop'
				: 'unknown';
		case 'opaque':
			return prop.buildTimeValue ? undefined : 'unknown';
		case 'serializable':
		case 'element-handle-id':
			return undefined;
		default:
			return 'unknown';
	}
}

export function mergeFirstUseReach(
	reaches: ReadonlyArray<ModuleGraphInterfaceFirstUseReach>,
): ModuleGraphInterfaceFirstUseReach {
	const union = (entries: ReadonlyArray<RuntimeDemandMapFirstUseReach>) =>
		entries.includes('unknown')
			? ('unknown' as const)
			: unionReach(entries as ReadonlyArray<RuntimeDemandMapFirstUse>);
	const names = [...new Set(reaches.flatMap((reach) => reach.props.map((entry) => entry.name)))];
	return {
		props: names.sort().map((name) => ({
			name,
			reach: union(
				reaches.map(
					(reach) =>
						reach.props.find((entry) => entry.name === name)?.reach ?? reach.otherProps,
				),
			),
		})),
		otherProps: union(reaches.map((reach) => reach.otherProps)),
		mount: union(reaches.map((reach) => reach.mount)),
		resume: union(reaches.map((reach) => reach.resume)),
	};
}

function unionReach(entries: ReadonlyArray<RuntimeDemandMapFirstUse>): RuntimeDemandMapFirstUse {
	const symbolIds = new Set<string>();
	const runtimeModuleIds = new Set<string>();
	const byFile = new Map<string, Set<string>>();
	const pageSpaceWrites: string[] = [];
	const calls: RuntimeDemandMapFirstUseCall[] = [];
	for (const entry of entries) {
		for (const id of entry.symbolIds) symbolIds.add(id);
		for (const id of entry.runtimeModuleIds) runtimeModuleIds.add(id);
		pageSpaceWrites.push(...(entry.pageSpaceWrites ?? []));
		calls.push(...(entry.calls ?? []));
		for (const foreign of entry.foreign ?? []) {
			const ids = byFile.get(foreign.file) ?? new Set<string>();
			for (const id of foreign.symbolIds) ids.add(id);
			byFile.set(foreign.file, ids);
		}
	}
	const foreign = [...byFile]
		.map(([file, ids]) => ({ file, symbolIds: [...ids].sort() }))
		.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
	return {
		symbolIds: [...symbolIds].sort(),
		runtimeModuleIds: [...runtimeModuleIds].sort(),
		...(foreign.length > 0 ? { foreign } : {}),
		...linkedParts(pageSpaceWrites, calls),
	};
}

function startsWithPath(path: ReadonlyArray<string>, prefix: ReadonlyArray<string>): boolean {
	return prefix.every((part, index) => path[index] === part);
}

function recordModules(
	records: RuntimeDemandMapArtifact['payloadRecords'],
	recordId: string,
): ReadonlyArray<string> {
	return records.find((record) => record.recordId === recordId)?.runtimeModuleIds ?? [];
}

function modulesForKind(
	records: RuntimeDemandMapArtifact['payloadRecords'],
	kind: string,
): ReadonlyArray<string> {
	return records
		.filter((record) => record.kind === kind)
		.flatMap((record) => record.runtimeModuleIds);
}

function symbolIdsDemand(
	symbolIds: ReadonlyArray<string>,
	symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<string> {
	return symbolIds.flatMap((symbolId) => symbolDemand.get(symbolId) ?? []);
}

function transitiveSymbolDemand(
	demand: ReadonlyMap<string, ReadonlyArray<string>>,
	captureAnalysis?: CaptureAnalysisArtifact,
): ReadonlyMap<string, ReadonlyArray<string>> {
	if (!captureAnalysis) return demand;
	const result = new Map<string, ReadonlyArray<string>>();
	const ids = new Set([
		...demand.keys(),
		...(captureAnalysis.boundResolverRows ?? []).map((row) => row.id),
	]);
	for (const id of ids) {
		result.set(
			id,
			unique(
				transitiveSymbolIds([id], captureAnalysis).flatMap(
					(symbolId) => demand.get(symbolId) ?? [],
				),
			),
		);
	}
	return result;
}

function transitiveSymbolIds(
	symbolIds: ReadonlyArray<string>,
	captureAnalysis?: CaptureAnalysisArtifact,
): string[] {
	if (!captureAnalysis) return [...symbolIds];
	const baseByBound = new Map(
		(captureAnalysis.boundResolverRows ?? []).map((row) => [row.id, row.baseSymbolId]),
	);
	const callbacksBySymbol = new Map(
		captureAnalysis.extractedSymbols.map((symbol) => [
			symbol.symbolId,
			symbol.captureSlots.flatMap((slot) =>
				slot.routes.flatMap((route) =>
					route.kind === 'callback-route' ? [route.callbackSymbolId] : [],
				),
			),
		]),
	);
	const result: string[] = [];
	const pending = [...symbolIds];
	while (pending.length > 0) {
		const requested = pending.shift()!;
		const symbolId = baseByBound.get(requested) ?? requested;
		if (result.includes(symbolId)) continue;
		result.push(symbolId);
		pending.push(...(callbacksBySymbol.get(symbolId) ?? []));
	}
	return result;
}

function eventKey(hostNodeId: string, eventName: string): string {
	return `${hostNodeId}:${eventName}`;
}

function unique<Value extends string>(values: ReadonlyArray<Value | undefined>): Value[] {
	return [...new Set(values.filter((value): value is Value => !!value))].sort();
}
