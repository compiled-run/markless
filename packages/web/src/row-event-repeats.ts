import type { ProtocolViewPayload } from '@markless/serializer/protocol';

/** The keyed lists whose rows carry event records, at top level and in served arms. */
export function rowEventRepeats(view: ProtocolViewPayload) {
	return [
		...(view.keyedRepeats ?? []),
		...(view.branches ?? []).flatMap((branch) => branch.servedArmRecords?.keyedRepeats ?? []),
	];
}
