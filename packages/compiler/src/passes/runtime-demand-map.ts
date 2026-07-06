import type {
	GeneratedSymbolModule,
	PublicRenderModuleArtifact,
	PlannedSymbol,
	RuntimeDemandMapArtifact,
	SymbolModulesArtifact,
	SymbolResolverPlan,
} from '../artifacts.ts';
import type { ProtocolViewPayload } from '@markless/serializer';

const DISPATCH_CORE = [
	'core/web/event-only-resume',
	'web/event-only-resume',
	'web/inline/payload-document',
	'web/event-only-graph',
];
const SCALAR_LEAN_DISPATCH_CORE = [
	'web/event-only-lean/scalar-resume',
	'web/inline/payload-document',
];
const SYNC_POLICY = ['web/inline/sync-policy-core'];
const DOM_UPDATE: string[] = [];
const KEYED_REPEAT = ['web/repeat-runtime', 'web/resume-keyed-repeats'];
const BRANCH = ['web/resume-branches'];
const ASYNC_BOUNDARY = ['web/resume-async-boundaries'];
const BEHAVIOR = ['web/event-only-behaviors', 'web/resume-behaviors'];
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
const RECORD_KINDS = ['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat'] as const;

export function createRuntimeDemandMap(input: {
	readonly symbolResolver: SymbolResolverPlan;
	readonly symbolModules: SymbolModulesArtifact;
	readonly publicRenderModule: PublicRenderModuleArtifact;
	readonly protocolView: ProtocolViewPayload;
}): RuntimeDemandMapArtifact {
	const emittedModules = new Map(input.symbolModules.modules.map((module) => [module.symbolId, module]));
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
	const symbolDemand = new Map(symbols.map((symbol) => [symbol.symbolId, symbol.runtimeModuleIds]));
	const scalarOnly = isScalarOnlyModule(input.symbolResolver, input.protocolView);
	const scalarRows = isScalarOnlyKeyedRepeatModule(input.symbolResolver, input.protocolView);
	const payloadRecords = payloadDemandRecords(input.protocolView, symbolDemand, renderRuntimeModuleIds, {
		scalarOnly,
		scalarRows,
	});
	return {
		passId: 'runtime-demand-map',
		version: 1,
		recordKinds: recordKindPhases({ scalarOnly, scalarRows }),
		symbols,
		payloadRecords,
		actions: actionDemandRecords(input.symbolResolver, input.protocolView, payloadRecords, symbolDemand, scalarRows),
		unknownRecordModuleIds: unique([
			...DISPATCH_CORE,
			...SCALAR_LEAN_DISPATCH_CORE,
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

function recordKindPhases(input: { readonly scalarOnly: boolean; readonly scalarRows: boolean }): RuntimeDemandMapArtifact['recordKinds'] {
	return RECORD_KINDS.map((kind) => ({
		kind,
		replaced: (
			(input.scalarOnly && (kind === 'event' || kind === 'dom-update')) ||
			(input.scalarRows && (kind === 'keyed-repeat' || kind === 'dom-update'))
		),
	}));
}

function isScalarOnlyModule(resolver: SymbolResolverPlan, view: ProtocolViewPayload): boolean {
	if ((view.events?.length ?? 0) === 0 || (view.domUpdates?.length ?? 0) === 0) return false;
	if ((view.keyedRepeats?.length ?? 0) > 0) return false;
	if ((view.branches?.length ?? 0) > 0) return false;
	if ((view.asyncBoundaries?.length ?? 0) > 0) return false;
	if ((view.behaviors?.length ?? 0) > 0) return false;
	if ((view.elementHandles?.length ?? 0) > 0) return false;

	const symbolsById = new Map(resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const eventSymbolIds = (view.events ?? []).flatMap((event) => event.symbolIds ?? []);
	if (eventSymbolIds.length === 0) return false;
	if (!eventSymbolIds.every((symbolId) => {
		const symbol = symbolsById.get(symbolId);
		return symbol?.kind === 'event-handler' && isScalarWriteOnlyEventSymbol(symbol);
	})) return false;

	const domUpdateSymbolIds = (view.domUpdates ?? []).map((update) => update.symbolId);
	if (domUpdateSymbolIds.some((symbolId) => !symbolId)) return false;
	return domUpdateSymbolIds.every((symbolId) => {
		const symbol = symbolsById.get(symbolId!);
		return symbol?.kind === 'dom-update' && isTextUpdateSymbol(symbol);
	});
}

function isScalarOnlyKeyedRepeatModule(resolver: SymbolResolverPlan, view: ProtocolViewPayload): boolean {
	if ((view.keyedRepeats?.length ?? 0) === 0 || (view.domUpdates?.length ?? 0) === 0) return false;
	if ((view.elementHandles?.length ?? 0) > 0) return false;
	const symbolsById = new Map(resolver.symbols.map((symbol) => [symbol.id, symbol]));
	const rowEvents = (view.keyedRepeats ?? []).flatMap((repeat) =>
		repeat.rowEvents.map((event) => ({ repeat, event })),
	);
	if (rowEvents.length === 0) return false;
	for (const { repeat, event } of rowEvents) {
		const eventSymbols = (event.symbolIds ?? []).map((symbolId) => symbolsById.get(symbolId));
		if (eventSymbols.length === 0) return false;
		if (!eventSymbols.every((symbol) =>
			symbol?.kind === 'event-handler' &&
			isScalarWriteOnlyEventSymbol(symbol, new Set([repeat.itemName])) &&
			!(symbol.writes ?? []).some((write) => write.graphNodeId === repeat.collectionGraphNodeId)
		)) return false;
		const writes = eventSymbols.flatMap((symbol) =>
			symbol?.kind === 'event-handler' ? symbol.writes ?? [] : [],
		);
		if (writes.length === 0) return false;
		if (writesDemandNonTextRuntime(writes, view)) return false;
		const domUpdateSymbolIds = textDomUpdatesForWrites(writes, view).map((update) => update.symbolId);
		if (domUpdateSymbolIds.length === 0 || domUpdateSymbolIds.some((symbolId) => !symbolId)) return false;
		if (!domUpdateSymbolIds.every((symbolId) => {
			const symbol = symbolsById.get(symbolId!);
			return symbol?.kind === 'dom-update' && isTextUpdateSymbol(symbol);
		})) return false;
	}
	return true;
}

function isScalarWriteOnlyEventSymbol(
	symbol: Extract<PlannedSymbol, { readonly kind: 'event-handler' }>,
	localNames: ReadonlySet<string> = new Set(),
): boolean {
	if ((symbol.writes ?? []).length !== 1) return false;
	if ((symbol.moduleImports ?? []).length > 0 || (symbol.elementHandleCalls ?? []).length > 0) return false;
	const write = symbol.writes?.[0];
	if (!write || write.path.length !== 0) return false;
	if (write.operation === 'update') return !!write.updateOperator;
	if (write.operation !== 'assign' || write.assignmentOperator) return false;
	return literalValueSource(write.valueSource) !== null || localPathValueSource(write.valueSource, localNames);
}

function isTextUpdateSymbol(symbol: Extract<PlannedSymbol, { readonly kind: 'dom-update' }>): boolean {
	const target = symbol.target;
	return target?.kind === 'text' &&
		target.prefix === undefined &&
		target.suffix === undefined &&
		target.trueValue === undefined &&
		target.falseValue === undefined;
}

function literalValueSource(source: string | undefined): string | null {
	if (!source) return null;
	const trimmed = source.trim();
	if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
	if (trimmed === 'true' || trimmed === 'false' || trimmed === 'null' || trimmed === 'undefined') {
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

function localPathValueSource(source: string | undefined, localNames: ReadonlySet<string>): boolean {
	const parts = source?.trim().split('.') ?? [];
	return parts.length >= 2 && parts.every(isIdentifier) && localNames.has(parts[0] ?? '');
}

function writesDemandNonTextRuntime(
	writes: ReadonlyArray<NonNullable<Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']>[number]>,
	view: ProtocolViewPayload,
): boolean {
	return writes.some((write) =>
		(view.asyncBoundaries ?? []).some((boundary) =>
			boundary.asyncReads.some((read) => read.graphNodeId === write.graphNodeId && startsWithPath(read.path, write.path)),
		) ||
		(view.branches ?? []).some((branch) =>
			(branch.testReads ?? []).some((read) => read.graphNodeId === write.graphNodeId && startsWithPath(read.path, write.path)),
		) ||
		(view.behaviors ?? []).some((behavior) =>
			(behavior.inputGraphReads ?? []).some((read) => read.graphNodeId === write.graphNodeId && startsWithPath(read.path, write.path)),
		) ||
		(view.domUpdates ?? []).some((update) =>
			update.graphNodeId === write.graphNodeId &&
			startsWithPath(update.path, write.path) &&
			update.target?.kind !== 'text',
		) ||
		!(view.domUpdates ?? []).some((update) =>
			update.graphNodeId === write.graphNodeId &&
			startsWithPath(update.path, write.path) &&
			update.target?.kind === 'text',
		)
	);
}

function textDomUpdatesForWrites(
	writes: ReadonlyArray<NonNullable<Extract<PlannedSymbol, { readonly kind: 'event-handler' }>['writes']>[number]>,
	view: ProtocolViewPayload,
): ProtocolViewPayload['domUpdates'] {
	return (view.domUpdates ?? []).filter((update) =>
		update.target?.kind === 'text' &&
		writes.some((write) =>
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
	replacement: { readonly scalarOnly: boolean; readonly scalarRows: boolean },
): RuntimeDemandMapArtifact['payloadRecords'] {
	const eventDispatchCore = replacement.scalarOnly || replacement.scalarRows ? SCALAR_LEAN_DISPATCH_CORE : DISPATCH_CORE;
	return [
		...(view.events ?? []).map((event) => ({
			recordId: `event:${event.hostNodeId}:${event.eventName}`,
			kind: 'event',
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			symbolIds: event.symbolIds ?? [],
			runtimeModuleIds: unique([
				...eventDispatchCore,
				...(event.syncPolicy ? SYNC_POLICY : []),
				...symbolIdsDemand(event.symbolIds ?? [], symbolDemand),
			]),
		})),
		...(view.domUpdates ?? []).map((record) => ({
			recordId: `dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'dom-update',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([...DOM_UPDATE, ...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand)]),
		})),
		...(view.keyedRepeats ?? []).map((record) => ({
			recordId: `keyed-repeat:${record.id}`,
			kind: 'keyed-repeat',
			hostNodeId: record.parentHostNodeId,
			runtimeModuleIds: unique([
				...(replacement.scalarRows ? SCALAR_LEAN_DISPATCH_CORE : FULL_TIER),
				...KEYED_REPEAT,
				...(replacement.scalarRows ? [] : renderRuntimeModuleIds),
			]),
		})),
		...(view.branches ?? []).map((record) => ({
			recordId: `branch:${record.id}`,
			kind: 'branch',
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([...BRANCH, ...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand)]),
		})),
		...(view.asyncBoundaries ?? []).map((record) => ({
			recordId: `async-boundary:${record.id}`,
			kind: 'async-boundary',
			symbolIds: unique([
				record.updateSymbolId,
				...(record.asyncReads ?? []).map((read) => read.runnerSymbolId),
			].filter((id): id is string => !!id)),
			runtimeModuleIds: unique([
				...FULL_TIER,
				...ASYNC_BOUNDARY,
				...symbolIdsDemand([
					record.updateSymbolId,
					...(record.asyncReads ?? []).map((read) => read.runnerSymbolId),
				].filter((id): id is string => !!id), symbolDemand),
			]),
		})),
		...(view.behaviors ?? []).map((record) => ({
			recordId: `behavior:${record.hostNodeId}:${record.symbolId ?? ''}`,
			kind: 'behavior',
			hostNodeId: record.hostNodeId,
			symbolIds: record.symbolId ? [record.symbolId] : [],
			runtimeModuleIds: unique([...BEHAVIOR, ...symbolIdsDemand(record.symbolId ? [record.symbolId] : [], symbolDemand)]),
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
): RuntimeDemandMapArtifact['actions'] {
	const branchDemand = view.branches?.length ? modulesForKind(records, 'branch') : [];
	const branchKinds = view.branches?.length ? ['branch'] : [];
	return [
		...(view.events ?? []).map((event) => {
			const subscriberRecords = writeSubscriberRecords(resolver, event.symbolIds ?? [], view, records);
			return {
				hostNodeId: event.hostNodeId,
				eventName: event.eventName,
				recordKind: 'event' as const,
				recordKinds: unique(['event', ...branchKinds, ...subscriberRecords.map((record) => record.kind)]),
				payloadRecordIds: unique([
					`event:${event.hostNodeId}:${event.eventName}`,
					...subscriberRecords.map((record) => record.recordId),
				]),
				runtimeModuleIds: unique([
					...recordModules(records, `event:${event.hostNodeId}:${event.eventName}`),
					...branchDemand,
					...subscriberRecords.flatMap((record) => record.runtimeModuleIds),
				]),
			};
		}),
		...(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => {
				const subscriberRecords = writeSubscriberRecords(resolver, event.symbolIds ?? [], view, records);
				const eagerBranchKinds = scalarRows ? [] : branchKinds;
				const eagerBranchDemand = scalarRows ? [] : branchDemand;
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
				};
			}),
		),
	];
}

function writeSubscriberRecords(
	resolver: SymbolResolverPlan,
	symbolIds: ReadonlyArray<string>,
	view: ProtocolViewPayload,
	records: RuntimeDemandMapArtifact['payloadRecords'],
): RuntimeDemandMapArtifact['payloadRecords'] {
	const writes = resolver.symbols.flatMap((symbol) =>
		symbolIds.includes(symbol.id) && (symbol.kind === 'event-handler' || symbol.kind === 'callback-prop')
			? symbol.writes ?? []
			: [],
	);
	if (writes.length === 0) return [];
	return [
		...records.filter((record) =>
			record.kind === 'dom-update' &&
			view.domUpdates?.some((update) =>
				record.recordId === `dom-update:${update.hostNodeId}:${update.symbolId ?? ''}` &&
				writes.some((write) => write.graphNodeId === update.graphNodeId && startsWithPath(update.path, write.path)),
			),
		),
		...records.filter((record) =>
			record.kind === 'async-boundary' &&
			view.asyncBoundaries?.some((boundary) =>
				record.recordId === `async-boundary:${boundary.id}` &&
				boundary.asyncReads.some((read) => writes.some((write) => write.graphNodeId === read.graphNodeId)),
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
	return records.filter((record) => record.kind === kind).flatMap((record) => record.runtimeModuleIds);
}

function symbolIdsDemand(
	symbolIds: ReadonlyArray<string>,
	symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<string> {
	return symbolIds.flatMap((symbolId) => symbolDemand.get(symbolId) ?? []);
}

function unique(values: ReadonlyArray<string | undefined>): string[] {
	return [...new Set(values.filter((value): value is string => !!value))].sort();
}
