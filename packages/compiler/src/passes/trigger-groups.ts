import type {
	CaptureAnalysisArtifact,
	RuntimeDemandMapAction,
	RuntimeDemandMapArtifact,
	SymbolResolverPlan,
	TriggerGroupArtifact,
} from '../artifacts.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';
import { PROTOCOL_EVENT_ACTION_KIND, protocolInstanceQualifies } from '@markless/serializer';

const ACTION_STAGES_WAKE = {
	[PROTOCOL_EVENT_ACTION_KIND.event]: true,
	[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: false,
	'keyed-repeat-row': true,
} as const satisfies Record<RuntimeDemandMapAction['recordKind'], boolean>;

// Build-computed interaction closure. The bundler composes these local groups
// through bound component edges; the browser never guesses reachability.
export function createTriggerGroups(input: {
	readonly symbolResolver: SymbolResolverPlan;
	readonly captureAnalysis?: CaptureAnalysisArtifact;
	readonly protocolState: ProtocolStatePayload;
	readonly protocolView: ProtocolViewPayload;
	readonly runtimeDemandMap: RuntimeDemandMapArtifact;
}): TriggerGroupArtifact {
	const symbols = new Map(input.symbolResolver.symbols.map((symbol) => [symbol.id, symbol]));
	const payloadRecords = new Map(
		input.runtimeDemandMap.payloadRecords.map((record) => [record.recordId, record]),
	);
	const zeroInputBehaviorRecordIds = input.protocolView.behaviors.flatMap((behavior) =>
		(behavior.inputGraphReads?.length ?? 0) === 0
			? [`behavior:${behavior.hostNodeId}:${behavior.symbolId ?? ''}`]
			: [],
	);
	return {
		passId: 'trigger-groups',
		groups: input.runtimeDemandMap.actions
			.filter((action) => ACTION_STAGES_WAKE[action.recordKind])
			.map((action) => {
				const payloadRecordIds = [
					...action.payloadRecordIds,
					...zeroInputBehaviorRecordIds,
				];
				const symbolIds = new Set<string>();
				for (const recordId of payloadRecordIds)
					for (const symbolId of payloadRecords.get(recordId)?.symbolIds ?? [])
						symbolIds.add(symbolId);
				const graphNodeIds = new Set<string>();
				for (const symbolId of symbolIds) {
					const symbol = symbols.get(symbolId);
					if (!symbol) continue;
					if ('reads' in symbol)
						for (const read of symbol.reads ?? []) graphNodeIds.add(read.graphNodeId);
					if ('writes' in symbol)
						for (const write of symbol.writes ?? [])
							graphNodeIds.add(write.graphNodeId);
				}
				closeCaptureDependencies(symbolIds, graphNodeIds, input.captureAnalysis, symbols);
				for (const recordId of payloadRecordIds)
					addRecordGraphNodes(graphNodeIds, recordId, input.protocolView);
				closeComputedDependencies(graphNodeIds, input.protocolState);
				return {
					id: `${action.hostNodeId}:${action.eventName}`,
					hostNodeId: action.hostNodeId,
					eventName: action.eventName,
					graphNodeIds: [...graphNodeIds].sort(),
					payloadRecordIds,
					symbolIds: [...symbolIds].sort(),
				};
			}),
	};
}

function closeCaptureDependencies(
	symbolIds: Set<string>,
	graphNodeIds: Set<string>,
	captures: CaptureAnalysisArtifact | undefined,
	plans: ReadonlyMap<string, SymbolResolverPlan['symbols'][number]>,
): void {
	if (!captures) return;
	const symbols = new Map(
		captures.extractedSymbols.map((symbol) => [
			symbol.loaderSymbolId ?? symbol.symbolId,
			symbol,
		]),
	);
	const rows = captures.boundResolverRows ?? [];
	const visited = new Set<string>();
	const pending = [...symbolIds].map((symbolId) => ({ symbolId, path: [] as readonly string[] }));
	for (let index = 0; index < pending.length; index++) {
		const { symbolId, path } = pending[index]!;
		const candidates = rows.filter(
			(row) =>
				row.baseSymbolId === symbolId &&
				row.componentEdgePath.length <= path.length &&
				row.componentEdgePath.every((edge, index) => edge === path[index]),
		);
		const bound =
			rows.find((row) => row.id === symbolId) ??
			candidates.sort((a, b) => b.componentEdgePath.length - a.componentEdgePath.length)[0];
		const key = bound?.id ?? symbolId;
		if (visited.has(key)) continue;
		visited.add(key);
		if (bound?.loaderSymbolId) {
			const imported = symbols.get(bound.loaderSymbolId);
			for (const write of imported?.graphWrites ?? [])
				graphNodeIds.add(
					protocolInstanceQualifies(write.graphNodeId)
						? (bound.instancePath ?? '') + write.graphNodeId
						: write.graphNodeId,
				);
		}
		if (bound) symbolIds.add(bound.id);
		else {
			const plan = plans.get(symbolId);
			if (plan && 'reads' in plan)
				for (const read of plan.reads ?? []) graphNodeIds.add(read.graphNodeId);
			if (plan && 'writes' in plan)
				for (const write of plan.writes ?? []) graphNodeIds.add(write.graphNodeId);
		}
		const routes = bound
			? bound.captureSlots.map((slot) => slot.route)
			: (symbols.get(symbolId)?.captureSlots.flatMap((slot) => slot.routes) ?? []);
		for (const route of routes) {
			if (route.kind === 'graph-reference' || route.kind === 'callback-slot-route')
				graphNodeIds.add(route.graphNodeId);
			if (route.kind !== 'callback-route') continue;
			symbolIds.add(route.callbackSymbolId);
			pending.push({
				symbolId: route.callbackSymbolId,
				path: bound?.componentEdgePath ?? path,
			});
		}
	}
}

function addRecordGraphNodes(
	graphNodeIds: Set<string>,
	recordId: string,
	view: ProtocolViewPayload,
): void {
	if (recordId.startsWith('dom-update:')) {
		// Matched whole: a composed host id (`c0:h1`) has colons of its own.
		for (const record of view.domUpdates)
			if (recordId === `dom-update:${record.hostNodeId}:${record.symbolId ?? ''}`)
				graphNodeIds.add(record.graphNodeId);
		return;
	}
	if (recordId.startsWith('branch:')) {
		const id = recordId.slice('branch:'.length);
		for (const read of view.branches?.find((record) => record.id === id)?.testReads ?? [])
			graphNodeIds.add(read.graphNodeId);
		return;
	}
	if (recordId.startsWith('async-boundary:')) {
		const id = recordId.slice('async-boundary:'.length);
		for (const read of view.asyncBoundaries.find((record) => record.id === id)?.asyncReads ??
			[])
			graphNodeIds.add(read.graphNodeId);
		return;
	}
	if (recordId.startsWith('keyed-repeat:')) {
		const id = recordId.slice('keyed-repeat:'.length);
		const repeat = view.keyedRepeats?.find((record) => record.id === id);
		if (repeat?.collectionGraphNodeId) graphNodeIds.add(repeat.collectionGraphNodeId);
		return;
	}
	if (recordId.startsWith('behavior:')) {
		const [, hostNodeId, symbolId = ''] = recordId.split(':');
		const behavior = view.behaviors.find(
			(record) => record.hostNodeId === hostNodeId && (record.symbolId ?? '') === symbolId,
		);
		for (const read of behavior?.inputGraphReads ?? []) graphNodeIds.add(read.graphNodeId);
	}
}

function closeComputedDependencies(graphNodeIds: Set<string>, state: ProtocolStatePayload): void {
	let changed = true;
	while (changed) {
		changed = false;
		for (const computed of state.computed) {
			if (!graphNodeIds.has(computed.graphNodeId)) continue;
			for (const dependency of computed.dependencies ?? []) {
				if (graphNodeIds.has(dependency.graphNodeId)) continue;
				graphNodeIds.add(dependency.graphNodeId);
				changed = true;
			}
		}
	}
}
