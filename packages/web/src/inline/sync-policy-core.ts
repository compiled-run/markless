import type {
	ProtocolSyncPolicy,
	ProtocolSyncPolicyBranch,
	ProtocolSyncPolicyCondition,
} from '../../../serializer/src/protocol.ts';

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
		const value = graph.read(condition.graphNodeId, condition.path ?? []);
		return 'equals' in condition ? value === condition.equals : Boolean(value);
	}
	if (condition.type === 'constant-truthy') return Boolean(condition.value);
	if (condition.type === 'submits-in-place')
		return submitsInPlace(event as unknown as SubmitEvent);

	return event[condition.field] === condition.value;
}

function syncPolicyBranches(policy: ProtocolSyncPolicy): ReadonlyArray<ProtocolSyncPolicyBranch> {
	if ('branches' in policy) return policy.branches;

	return [policy];
}

type Submitter = HTMLButtonElement | HTMLInputElement;

/**
 * Whether the browser would send this submit as a POST to this origin in this tab, which the runtime then sends in place.
 * `prevented` asks again after the policy has kept the submit from the browser. The inline boot embeds this function's
 * source, so it reads only the event and the document.
 */
export function submitsInPlace(event: SubmitEvent, prevented?: boolean): boolean {
	const form = event.target as HTMLFormElement;
	const by = event.submitter as Submitter | null;
	const own = (name: string) => !!by && by.hasAttribute('form' + name);
	const target = own('target')
		? by!.formTarget
		: form.target || document.querySelector('base[target]')?.getAttribute('target');
	return (
		(prevented || !event.defaultPrevented) &&
		(own('method') ? by!.formMethod : form.method) == 'post' &&
		(!target || target.toLowerCase() == '_self') &&
		!form.relList.contains('external') &&
		new URL(own('action') ? by!.formAction : form.action).origin == location.origin
	);
}
