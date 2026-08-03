import type {
	RuntimeDemandMapArtifact,
	SymbolResolverPlan,
	TriggerGroupArtifact,
} from '../artifacts.ts';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer';

// Build-computed interaction closure. The bundler composes these local groups
// through bound component edges; the browser never guesses reachability.
export function createTriggerGroups(input: {
	readonly symbolResolver: SymbolResolverPlan;
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
		groups: input.runtimeDemandMap.actions.map((action) => {
			const payloadRecordIds = [...action.payloadRecordIds, ...zeroInputBehaviorRecordIds];
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
					for (const write of symbol.writes ?? []) graphNodeIds.add(write.graphNodeId);
			}
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

function addRecordGraphNodes(
	graphNodeIds: Set<string>,
	recordId: string,
	view: ProtocolViewPayload,
): void {
	if (recordId.startsWith('dom-update:')) {
		const [, hostNodeId, symbolId = ''] = recordId.split(':');
		for (const record of view.domUpdates)
			if (record.hostNodeId === hostNodeId && (record.symbolId ?? '') === symbolId)
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
		for (const read of view.asyncBoundaries.find((record) => record.id === id)?.asyncReads ?? [])
			graphNodeIds.add(read.graphNodeId);
		return;
	}
	if (recordId.startsWith('keyed-repeat:')) {
		const id = recordId.slice('keyed-repeat:'.length);
		const repeat = view.keyedRepeats?.find((record) => record.id === id);
		if (repeat) graphNodeIds.add(repeat.collectionGraphNodeId);
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

function closeComputedDependencies(
	graphNodeIds: Set<string>,
	state: ProtocolStatePayload,
): void {
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
