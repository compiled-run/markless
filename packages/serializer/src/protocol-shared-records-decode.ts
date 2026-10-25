import type { SerializedRecord, SerializedSlot } from './value.ts';

type Envelope = { readonly root: SerializedSlot; records: ReadonlyArray<SerializedRecord> };
type Holder = Record<string, unknown> | null | undefined;

const ref = (slot: SerializedSlot, copy: (id: number) => number): SerializedSlot =>
	typeof slot === 'object' && slot !== null && '$ref' in slot ? { $ref: copy(slot.$ref) } : slot;

// A record with each $ref it holds renamed; the encoder shares only object, array, map and set records.
function renamed(record: SerializedRecord, copy: (id: number) => number): SerializedRecord {
	const map = (slot: SerializedSlot) => ref(slot, copy);
	if (record.type === 'object')
		return { ...record, fields: record.fields.map(([key, slot]) => [key, map(slot)] as const) };
	if (record.type === 'array') return { ...record, items: record.items.map(map) };
	if (record.type === 'map')
		return { ...record, entries: record.entries.map(([key, value]) => [map(key), map(value)] as const) };
	if (record.type === 'set') return { ...record, values: record.values.map(map) };
	if (record.type === 'typed-array' || record.type === 'data-view')
		return { ...record, buffer: map(record.buffer) };
	return record;
}

/**
 * Gives every envelope of a freshly parsed state payload, in place, a copy of each shared subtree
 * it references, under ids of its own: two references to one shared record are two objects.
 */
export function expandSharedRecords<T>(state: T): T {
	const payload = state as {
		readonly cells?: ReadonlyArray<Holder>;
		readonly computed?: ReadonlyArray<Holder>;
		sharedRecords?: ReadonlyArray<SerializedRecord>;
	} | null;
	const shared = payload?.sharedRecords;
	if (!shared) return state;
	const byId = new Map(shared.map((record) => [record.id, record]));
	const expand = (envelope: unknown) => {
		const records = (envelope as Envelope | null)?.records;
		if (!Array.isArray(records)) return;
		let next = 0;
		for (const record of records) next = Math.max(next, record.id + 1);
		const copies: SerializedRecord[] = [];
		const copy = (id: number): number => {
			const record = byId.get(id);
			if (!record) return id;
			const at = next++;
			const slot = copies.push(record) - 1;
			copies[slot] = { ...renamed(record, copy), id: at };
			return at;
		};
		const own = records.map((record) => renamed(record, copy));
		if (copies.length) (envelope as Envelope).records = [...own, ...copies];
	};
	for (const cell of payload.cells ?? []) expand(cell?.value);
	for (const computed of payload.computed ?? []) {
		expand(computed?.value);
		const snapshot = computed?.snapshot as Holder;
		expand(snapshot?.key);
		expand(snapshot?.value);
		expand(snapshot?.error);
	}
	delete payload.sharedRecords;
	return state;
}
