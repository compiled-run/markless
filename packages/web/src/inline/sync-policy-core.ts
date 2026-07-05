import type { ProtocolSyncPolicy, ProtocolSyncPolicyBranch, ProtocolSyncPolicyCondition } from '../../../serializer/src/protocol.ts';

export type SyncPolicyGraph = {
	read(graphNodeId: string, path?: ReadonlyArray<string>): unknown;
};

export type SyncPolicyDomEvent = {
	readonly preventDefault?: () => void;
	readonly stopPropagation?: () => void;
	readonly [key: string]: unknown;
};

export function runSyncPolicyActions(
	policy: ProtocolSyncPolicy,
	graph: SyncPolicyGraph,
	event: SyncPolicyDomEvent,
): void {
	for (const branch of syncPolicyBranches(policy)) {
		if (!evaluateSyncPolicy(branch.when, graph, event)) continue;

		for (const action of branch.actions) {
			if (action === 'preventDefault') event.preventDefault?.();
			if (action === 'stopPropagation') event.stopPropagation?.();
		}
	}
}

function evaluateSyncPolicy(
	condition: ProtocolSyncPolicyCondition,
	graph: SyncPolicyGraph,
	event: SyncPolicyDomEvent,
): boolean {
	if (condition.type === 'and') {
		return condition.conditions.every((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'or') {
		return condition.conditions.some((child) => evaluateSyncPolicy(child, graph, event));
	}
	if (condition.type === 'not') return !evaluateSyncPolicy(condition.condition, graph, event);
	if (condition.type === 'graph-truthy') {
		return Boolean(graph.read(condition.graphNodeId, condition.path ?? []));
	}
	if (condition.type === 'constant-truthy') return Boolean(condition.value);

	return event[condition.field] === condition.value;
}

function syncPolicyBranches(policy: ProtocolSyncPolicy): ReadonlyArray<ProtocolSyncPolicyBranch> {
	if ('branches' in policy) return policy.branches;

	return [policy];
}
