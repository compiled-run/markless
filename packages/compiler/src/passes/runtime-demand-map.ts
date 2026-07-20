import type {
	CaptureAnalysisArtifact,
	GeneratedSymbolModule,
	PublicRenderModuleArtifact,
	PlannedSymbol,
	RuntimeDemandMapActionPlan,
	RuntimeDemandMapArtifact,
	SymbolModulesArtifact,
	SymbolResolverPlan,
} from '../artifacts.ts';
import type { ProtocolViewPayload } from '@markless/serializer';

const DISPATCH_CORE = [
	'core/web/resume',
	'web/resume',
	'web/resume-runtime',
	'web/resume-runtime-shared',
	'web/resume-runtime-start',
	'web/resume-events',
	'web/resume-locators',
	'web/payload-full',
	'web/payload-resume',
	'web/payload-graph-construct',
	'web/resume-async-wiring',
	// Error enrichment is dispatch infrastructure (T012): loaded by the shared
	// runtime on any dispatch path, not a capability.
	'web/runtime-error-reporting',
];
const SCALAR_LEAN_DISPATCH_CORE = [
	'web/fns/write-scalar',
	'web/fns/update-text',
	'web/runtime-error-reporting',
	// Tiny generic helpers for emitted scalar dispatchers: DOM-order lookup,
	// scalar-cell decode/validation, and fail-closed error creation.
	'web/fns/scalar-specialized',
];
const ROW_LEAN_DISPATCH_CORE = ['web/event-only-lean/row', 'web/event-only-lean/lean-shared'];
const SYNC_POLICY = ['web/inline/sync-policy-core'];
const DOM_UPDATE: string[] = [];
const KEYED_REPEAT = ['web/repeat-runtime', 'web/resume-keyed-repeats'];
const BRANCH = ['web/resume-branches'];
const ASYNC_BOUNDARY = ['web/resume-async-boundaries'];
const BEHAVIOR = ['web/resume-behaviors'];
const FULL_RESUME_CORE = ['web/resume-locators'];
const FULL_TIER = [
	'core/web/resume',
	'web/resume',
	'web/resume-runtime',
	'web/resume-runtime-shared',
	'web/resume-runtime-start',
	'web/resume-events',
	'web/payload-full',
	'web/payload-resume',
	'web/payload-graph-construct',
	'web/resume-async-wiring',
];
const RECORD_KINDS = [
	'async-boundary',
	'behavior',
	'branch',
	'dom-update',
	'element-handle',
	'event',
	'keyed-repeat',
] as const;

export function createRuntimeDemandMap(input: {
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis?: CaptureAnalysisArtifact;
	readonly symbolModules: SymbolModulesArtifact;
	readonly publicRenderModule: PublicRenderModuleArtifact;
	readonly protocolView: ProtocolViewPayload;
}): RuntimeDemandMapArtifact {
	const emittedModules = new Map(
		input.symbolModules.modules.map((module) => [module.symbolId, module]),
	);
	const renderRuntimeModuleIds = runtimeModuleIdsFromSources([
		input.publicRenderModule.moduleSource,
		input.publicRenderModule.csrModuleSource,
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
		input.captureAnalysis,
	);
	const scalarEvents = scalarEventKeys.size > 0;
	const scalarRows = isScalarOnlyKeyedRepeatModule(input.symbolResolver, input.protocolView);
	const payloadRecords = payloadDemandRecords(
		input.protocolView,
		closedSymbolDemand,
		renderRuntimeModuleIds,
		{
			scalarEventKeys,
			scalarRows,
		},
	);
	return {
		passId: 'runtime-demand-map',
		version: 1,
		recordKinds: recordKindPhases({ scalarEvents, scalarRows }),
		symbols,
		payloadRecords,
		actions: actionDemandRecords(
			input.symbolResolver,
			input.protocolView,
			payloadRecords,
			closedSymbolDemand,
			scalarRows,
			input.captureAnalysis,
		),
		unknownRecordModuleIds: unique([
			...DISPATCH_CORE,
			...SCALAR_LEAN_DISPATCH_CORE,
			...ROW_LEAN_DISPATCH_CORE,
			...SYNC_POLICY,
			...DOM_UPDATE,
			'web/dom-update',
			'web/dom-journal',
			...KEYED_REPEAT,
			...BRANCH,
			...ASYNC_BOUNDARY,
			...BEHAVIOR,
			...FULL_RESUME_CORE,
			...FULL_TIER,
		]),
	};
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

function scalarCoreEventKeys(
	resolver: SymbolResolverPlan,
	view: ProtocolViewPayload,
	captureAnalysis?: CaptureAnalysisArtifact,
): ReadonlySet<string> {
	if ((view.events?.length ?? 0) === 0 || (view.domUpdates?.length ?? 0) === 0) return new Set();
	if ((view.branches?.length ?? 0) > 0) return new Set();
	if ((view.asyncBoundaries?.length ?? 0) > 0) return new Set();
	if ((view.behaviors?.length ?? 0) > 0) return new Set();
	if ((view.elementHandles?.length ?? 0) > 0) return new Set();

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
					transitiveSymbolIds(event.symbolIds ?? [], captureAnalysis).length ===
						(event.symbolIds ?? []).length &&
					(event.symbolIds ?? []).length === 1 &&
					!(event.symbolIds ?? []).some((symbolId) => rowSymbolIds.has(symbolId)) &&
					(event.symbolIds ?? []).every((symbolId) => {
						const symbol = symbolsById.get(symbolId);
						return (
							symbol?.kind === 'event-handler' &&
							isScalarWriteOnlyEventSymbol(symbol) &&
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
	if ((symbol.moduleImports ?? []).length > 0 || (symbol.elementHandleCalls ?? []).length > 0)
		return false;
	const write = symbol.writes?.[0];
	if (!write || write.path.length !== 0) return false;
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
		target.suffix === undefined &&
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
	replacement: { readonly scalarEventKeys: ReadonlySet<string>; readonly scalarRows: boolean },
): RuntimeDemandMapArtifact['payloadRecords'] {
	const rowDispatchCore = replacement.scalarRows ? ROW_LEAN_DISPATCH_CORE : FULL_TIER;
	return [
		...(view.events ?? []).map((event) => ({
			recordId: `event:${event.hostNodeId}:${event.eventName}`,
			kind: 'event',
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			symbolIds: event.symbolIds ?? [],
			runtimeModuleIds: unique([
				...(replacement.scalarEventKeys.has(eventKey(event.hostNodeId, event.eventName))
					? SCALAR_LEAN_DISPATCH_CORE
					: DISPATCH_CORE),
				...(event.syncPolicy ? SYNC_POLICY : []),
				...symbolIdsDemand(event.symbolIds ?? [], symbolDemand),
			]),
		})),
		...(view.domUpdates ?? []).map((record) => ({
			recordId: `dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'dom-update',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...DOM_UPDATE,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.keyedRepeats ?? []).map((record) => ({
			recordId: `keyed-repeat:${record.id}`,
			kind: 'keyed-repeat',
			hostNodeId: record.parentHostNodeId,
			runtimeModuleIds: unique([
				...rowDispatchCore,
				...KEYED_REPEAT,
				...(replacement.scalarRows ? [] : renderRuntimeModuleIds),
			]),
		})),
		...(view.branches ?? []).map((record) => ({
			recordId: `branch:${record.id}`,
			kind: 'branch',
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...BRANCH,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.asyncBoundaries ?? []).map((record) => ({
			recordId: `async-boundary:${record.id}`,
			kind: 'async-boundary',
			symbolIds: unique(
				[
					record.updateSymbolId,
					...(record.asyncReads ?? []).map((read) => read.runnerSymbolId),
				].filter((id): id is string => !!id),
			),
			runtimeModuleIds: unique([
				...FULL_TIER,
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
		...(view.behaviors ?? []).map((record) => ({
			recordId: `behavior:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'behavior',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([
				...BEHAVIOR,
				...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand),
			]),
		})),
		...(view.elementHandles ?? []).map((record) => ({
			recordId: `element-handle:${record.hostNodeId}`,
			kind: 'element-handle',
			hostNodeId: record.hostNodeId,
			runtimeModuleIds: FULL_RESUME_CORE,
		})),
	];
}

function actionDemandRecords(
	resolver: SymbolResolverPlan,
	view: ProtocolViewPayload,
	records: RuntimeDemandMapArtifact['payloadRecords'],
	symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>,
	scalarRows: boolean,
	captureAnalysis?: CaptureAnalysisArtifact,
): RuntimeDemandMapArtifact['actions'] {
	const branchDemand = view.branches?.length ? modulesForKind(records, 'branch') : [];
	const branchKinds = view.branches?.length ? ['branch'] : [];
	return [
		...(view.events ?? []).map((event) => {
			const subscriberRecords = writeSubscriberRecords(
				resolver,
				transitiveSymbolIds(event.symbolIds ?? [], captureAnalysis),
				view,
				records,
			);
			const plan = scalarActionPlan(resolver, event, view, subscriberRecords);
			return {
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				recordKind: 'event' as const,
				recordKinds: unique([
					'event',
					...branchKinds,
					...subscriberRecords.map((record) => record.kind),
				]),
				payloadRecordIds: unique([
					`event:${event.hostNodeId}:${event.eventName}`,
					...subscriberRecords.map((record) => record.recordId),
				]),
				runtimeModuleIds: unique([
					...recordModules(records, `event:${event.hostNodeId}:${event.eventName}`),
					...branchDemand,
					...subscriberRecords.flatMap((record) => record.runtimeModuleIds),
				]),
				...(plan ? { plan } : {}),
			};
		}),
		...(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => {
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

function unique(values: ReadonlyArray<string | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))].sort();
}
