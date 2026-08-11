import { marklessSerializeSlot, type MarklessSerializedRecord } from './state-slot.ts';

export function marklessSerializeGraphValue(value: unknown) {
	const records: MarklessSerializedRecord[] = [];
	const seen = new Map<unknown, number>();
	return { version: 1, root: marklessSerializeSlot(value, records, seen), records };
}
