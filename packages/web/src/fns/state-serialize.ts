import { marklessSerializeSlot } from './state-slot.ts';

export function marklessSerializeGraphValue(value) {
	const records = [];
	const seen = new Map();
	return { version: 1, root: marklessSerializeSlot(value, records, seen), records };
}
