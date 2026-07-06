import type {
	GeneratedSymbolModule,
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
const RECORD_KIND_PHASES = ['async-boundary', 'behavior', 'branch', 'dom-update', 'element-handle', 'event', 'keyed-repeat']
	.map((kind) => ({ kind, replaced: false }));

export function createRuntimeDemandMap(input: {
	readonly symbolResolver: SymbolResolverPlan;
	readonly symbolModules: SymbolModulesArtifact;
	readonly protocolView: ProtocolViewPayload;
}): RuntimeDemandMapArtifact {
	const emittedModules = new Map(input.symbolModules.modules.map((module) => [module.symbolId, module]));
	const symbols = input.symbolResolver.symbols.map((symbol) => ({
		symbolId: symbol.id,
		kind: symbol.kind,
		runtimeModuleIds: runtimeModuleIdsForSymbol(symbol, emittedModules.get(symbol.id)),
	}));
	const symbolDemand = new Map(symbols.map((symbol) => [symbol.symbolId, symbol.runtimeModuleIds]));
	const payloadRecords = payloadDemandRecords(input.protocolView, symbolDemand);
	return {
		passId: 'runtime-demand-map',
		version: 1,
		recordKinds: RECORD_KIND_PHASES,
		symbols,
		payloadRecords,
		actions: actionDemandRecords(input.symbolResolver, input.protocolView, payloadRecords, symbolDemand),
		unknownRecordModuleIds: unique([
			...DISPATCH_CORE,
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

function runtimeModuleIdsForSymbol(
	_symbol: PlannedSymbol,
	module: GeneratedSymbolModule | undefined,
): ReadonlyArray<string> {
	if (!module) return [];
	return unique(
		[...module.source.matchAll(/from ['"]@markless\/web\/fns\/([^'"]+)['"]/g)].map(
			(match) => `web/fns/${match[1]}`,
		),
	);
}

function payloadDemandRecords(
	view: ProtocolViewPayload,
	symbolDemand: ReadonlyMap<string, ReadonlyArray<string>>,
): RuntimeDemandMapArtifact['payloadRecords'] {
	return [
		...(view.events ?? []).map((event) => ({
			recordId: `event:${event.hostNodeId}:${event.eventName}`,
			kind: 'event',
			hostNodeId: event.hostNodeId,
			eventName: event.eventName,
			symbolIds: event.symbolIds ?? [],
			runtimeModuleIds: unique([
				...DISPATCH_CORE,
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
			runtimeModuleIds: unique([...FULL_TIER, ...KEYED_REPEAT]),
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
				return {
					hostNodeId: repeat.parentHostNodeId,
					eventName: event.eventName,
					recordKind: 'keyed-repeat-row' as const,
					recordKinds: unique([
						'keyed-repeat',
						...branchKinds,
						...subscriberRecords.map((record) => record.kind),
					]),
					runtimeModuleIds: unique([
						...recordModules(records, `keyed-repeat:${repeat.id}`),
						...(event.syncPolicy ? SYNC_POLICY : []),
						...symbolIdsDemand(event.symbolIds ?? [], symbolDemand),
						...branchDemand,
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
