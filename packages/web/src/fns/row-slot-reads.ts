import type { RuntimeGraph } from '@markless/runtime';
import type { ResumeKeyedRepeatRecord } from '../resume-types.ts';

export type SlotRead = { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> };
// Row code can arrive after a gesture's write, so a slot read is compared with the state its row was painted from.
export function movedSincePaint(graph: Pick<RuntimeGraph, 'read'>, repeats: ReadonlyArray<ResumeKeyedRepeatRecord>) {
	// An unserializable value compares by identity.
	const text = (read: SlotRead): unknown => {
		let value: unknown;
		try {
			value = graph.read(read.graphNodeId, read.path);
			return JSON.stringify(value, (_, v) =>
				typeof v === 'bigint' ? `${v}n` : v instanceof Map || v instanceof Set ? [...v] : v,
			);
		} catch {
			return value;
		}
	};
	const served = new Map(repeats.flatMap(rowSlotReads).map((read) => [JSON.stringify(read), text(read)]));
	return (read: SlotRead) => served.has(JSON.stringify(read)) && served.get(JSON.stringify(read)) !== text(read);
}
type SlotOwner = Pick<NonNullable<ResumeKeyedRepeatRecord['rowTemplate']>, 'textSlots' | 'attributeSlots'>;
export function templateSlots(repeat: ResumeKeyedRepeatRecord) {
	return slotsOf(repeat.rowTemplate ?? {});
}
function slotsOf(owner: SlotOwner) {
	return [...(owner.textSlots ?? []), ...(owner.attributeSlots ?? [])];
}
// One group per text or attribute slot, then one for every @if value.
export function slotReadGroups(repeat: ResumeKeyedRepeatRecord): SlotRead[][] {
	const branches = (repeat.rowTemplate?.branchSlots ?? []).flatMap((branch) => [branch, ...branch.arms.flatMap(slotsOf)]);
	return [...templateSlots(repeat).map((slot) => [slot]), branches].map((group: ReadonlyArray<(typeof branches)[number]>) =>
		group.flatMap((slot) =>
			'source' in slot
				? (slot.reads ?? [])
				: 'graphNodeId' in slot
					? [{ graphNodeId: slot.graphNodeId, path: slot.graphPath }]
					: [],
		),
	);
}
export function rowSlotReads(repeat: ResumeKeyedRepeatRecord) {
	return slotReadGroups(repeat).flat();
}
