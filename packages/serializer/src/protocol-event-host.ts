import type { ProtocolSyncPolicy } from './protocol.ts';

/**
 * The attribute the server writes on each served element that hosts an event
 * record. The inline boot reads it from the event target up, so it finds a
 * press's handler and sync policy without parsing a payload or knowing the
 * element's position. Grammar: entries joined by `;`, each
 * `name[:ref][!policy]`, where `ref` is the record's index in its region's event
 * list (or `-` for an event an external delegate owns) and `policy` is `p`, `s`,
 * `ps` or an index into the container's sync-policy table.
 */
export const PROTOCOL_EVENT_HOST_ATTRIBUTE = 'm:on';
/** The inert script holding each distinct conditional sync policy of a container once. */
export const PROTOCOL_SYNC_POLICY_TABLE_TYPE = 'markless/policy';

export const PROTOCOL_EVENT_HOST_ENTRY_SEPARATOR = ';';
export const PROTOCOL_EVENT_HOST_REF_SEPARATOR = ':';
export const PROTOCOL_EVENT_HOST_POLICY_SEPARATOR = '!';
export const PROTOCOL_EVENT_HOST_DELEGATED_REF = '-';

export type ProtocolConstantSyncPolicyCode = 'p' | 's' | 'ps';

export type ProtocolEventHostEntry = {
	readonly name: string;
	readonly ref?: number | typeof PROTOCOL_EVENT_HOST_DELEGATED_REF;
	readonly policy?: ProtocolConstantSyncPolicyCode | number;
};

export function formatEventHostEntries(entries: ReadonlyArray<ProtocolEventHostEntry>): string {
	return entries
		.map(
			(entry) =>
				entry.name +
				(entry.ref === undefined ? '' : PROTOCOL_EVENT_HOST_REF_SEPARATOR + entry.ref) +
				(entry.policy === undefined ? '' : PROTOCOL_EVENT_HOST_POLICY_SEPARATOR + entry.policy),
		)
		.join(PROTOCOL_EVENT_HOST_ENTRY_SEPARATOR);
}

export function parseEventHostEntries(value: string): ProtocolEventHostEntry[] {
	return value
		.split(PROTOCOL_EVENT_HOST_ENTRY_SEPARATOR)
		.filter(Boolean)
		.map((text) => {
			const [head = '', policy] = text.split(PROTOCOL_EVENT_HOST_POLICY_SEPARATOR);
			const [name = '', ref] = head.split(PROTOCOL_EVENT_HOST_REF_SEPARATOR);
			return {
				name,
				...(ref === undefined
					? {}
					: { ref: ref === PROTOCOL_EVENT_HOST_DELEGATED_REF ? ref : Number(ref) }),
				...(policy === undefined
					? {}
					: {
							policy:
								policy === 'p' || policy === 's' || policy === 'ps'
									? policy
									: Number(policy),
						}),
			};
		});
}

/**
 * The inline spelling of a policy that acts on every event, or undefined when the
 * policy reads the event or the graph and so needs the table.
 */
export function constantSyncPolicyCode(
	policy: ProtocolSyncPolicy,
): ProtocolConstantSyncPolicyCode | undefined {
	const branches = 'branches' in policy ? policy.branches : [policy];
	let prevent = false;
	let stop = false;
	for (const branch of branches) {
		if (branch.when.type !== 'constant-truthy') return undefined;
		if (!branch.when.value) continue;
		prevent ||= branch.actions.includes('preventDefault');
		stop ||= branch.actions.includes('stopPropagation');
	}
	if (prevent && stop) return 'ps';
	if (prevent) return 'p';
	if (stop) return 's';
	return undefined;
}

/** Whether a policy can never act, so its host needs no policy entry at all. */
export function syncPolicyNeverActs(policy: ProtocolSyncPolicy): boolean {
	const branches = 'branches' in policy ? policy.branches : [policy];
	return branches.every(
		(branch) =>
			branch.actions.length === 0 ||
			(branch.when.type === 'constant-truthy' && !branch.when.value),
	);
}
