import type { SerializedRecord, SerializedSlot } from './value.ts';

type Envelope = { readonly root: SerializedSlot; records: ReadonlyArray<SerializedRecord> };

type SharedRecordsState = {
	readonly cells?: ReadonlyArray<{ readonly value?: unknown }>;
	readonly computed?: ReadonlyArray<{
		readonly value?: unknown;
		readonly snapshot?: { readonly key?: unknown; readonly value?: unknown; readonly error?: unknown };
	}>;
	readonly sharedRecords?: ReadonlyArray<SerializedRecord>;
};

function isEnvelope(value: unknown): value is Envelope {
	return (
		typeof value === 'object' &&
		value !== null &&
		'root' in value &&
		Array.isArray((value as { readonly records?: unknown }).records)
	);
}

type Snapshot = Readonly<Record<'key' | 'value' | 'error', unknown>>;

const SNAPSHOT_ENVELOPES = ['key', 'value', 'error'] as const;

// Every value envelope a state payload carries: cell values, served computed values and async snapshots.
function envelopesOf(state: SharedRecordsState): Envelope[] {
	const found: Envelope[] = [];
	const take = (value: unknown) => {
		if (isEnvelope(value) && value.records.length > 0) found.push(value);
	};
	for (const cell of state.cells ?? []) take(cell.value);
	for (const computed of state.computed ?? []) {
		take(computed.value);
		for (const key of SNAPSHOT_ENVELOPES) take((computed.snapshot as Snapshot | undefined)?.[key]);
	}
	return found;
}

function withEnvelopes<T extends object>(state: T, next: ReadonlyMap<Envelope, Envelope>): T {
	const swap = <R extends object>(holder: R, key: string): R => {
		const value = (holder as Record<string, unknown>)[key] as Envelope;
		return next.has(value) ? { ...holder, [key]: next.get(value) } : holder;
	};
	const { cells, computed } = state as SharedRecordsState;
	return {
		...state,
		...(cells ? { cells: cells.map((cell) => swap(cell, 'value')) } : {}),
		...(computed
			? {
					computed: computed.map((entry) => {
						const swapped = swap(entry, 'value');
						if (!entry.snapshot) return swapped;
						const snapshot = SNAPSHOT_ENVELOPES.reduce<object>(swap, entry.snapshot);
						return snapshot === entry.snapshot ? swapped : { ...swapped, snapshot };
					}),
				}
			: {}),
	};
}

function mapSlot(slot: SerializedSlot, ref: (id: number) => number): SerializedSlot {
	return typeof slot === 'object' && slot !== null && '$ref' in slot ? { $ref: ref(slot.$ref) } : slot;
}

function mapRecordSlots(record: SerializedRecord, ref: (id: number) => number): SerializedRecord {
	const map = (slot: SerializedSlot) => mapSlot(slot, ref);
	switch (record.type) {
		case 'object':
			return { ...record, fields: record.fields.map(([key, slot]) => [key, map(slot)] as const) };
		case 'array':
			return { ...record, items: record.items.map(map) };
		case 'map':
			return { ...record, entries: record.entries.map(([key, value]) => [map(key), map(value)] as const) };
		case 'set':
			return { ...record, values: record.values.map(map) };
		case 'typed-array':
		case 'data-view':
			return { ...record, buffer: map(record.buffer) };
		default:
			return record;
	}
}

function forEachRef(record: SerializedRecord, visit: (id: number) => void): void {
	const slot = (value: SerializedSlot) => {
		if (typeof value === 'object' && value !== null && '$ref' in value) visit(value.$ref);
	};
	if (record.type === 'object') for (const [, value] of record.fields) slot(value);
	else if (record.type === 'array') record.items.forEach(slot);
	else if (record.type === 'map')
		for (const [key, value] of record.entries) {
			slot(key);
			slot(value);
		}
	else if (record.type === 'set') record.values.forEach(slot);
	else if (record.type === 'typed-array' || record.type === 'data-view') slot(record.buffer);
}

/**
 * Serves each subtree of records that two or more value envelopes hold once, in `sharedRecords`.
 * A component that hands its rows their own subtrees as props holds every subtree again at each
 * level above it. Only a subtree each of whose records the envelope reaches exactly once is
 * shared, so `expandSharedRecords` rebuilds one fresh copy per reference and every decoded value
 * keeps exactly the object identities it was served with. An envelope's root record stays its own.
 */
export function shareStateRecords<T extends object>(state: T): T {
	const envelopes = envelopesOf(state as SharedRecordsState);
	if (envelopes.length < 2) return state;
	const keyIndex = new Map<string, number>();
	const holders: number[] = [];
	const lastHolder: number[] = [];
	const representative: Array<{
		readonly record: SerializedRecord;
		readonly keys: Map<number, number | null>;
	}> = [];
	const keysByEnvelope = envelopes.map((envelope, holder) => {
		const byId = new Map(envelope.records.map((record) => [record.id, record]));
		const references = new Map<number, number>();
		const count = (id: number) => references.set(id, (references.get(id) ?? 0) + 1);
		const root = rootRecordId(envelope);
		if (root !== undefined) count(root);
		for (const record of envelope.records) forEachRef(record, count);
		const keys = new Map<number, number | null>();
		const keyOf = (id: number): number | null => {
			if (keys.has(id)) return keys.get(id)!;
			keys.set(id, null);
			const record = byId.get(id);
			if (!record || references.get(id) !== 1) return null;
			let reachedTwice = false;
			const { id: _id, ...shape } = mapRecordSlots(record, (child) => {
				const key = keyOf(child);
				if (key === null) reachedTwice = true;
				return key ?? -1;
			});
			if (reachedTwice) return null;
			const text = JSON.stringify(shape);
			let key = keyIndex.get(text);
			if (key === undefined) {
				key = keyIndex.size;
				keyIndex.set(text, key);
				holders.push(0);
				lastHolder.push(-1);
				representative.push({ record, keys });
			}
			if (lastHolder[key] !== holder) {
				lastHolder[key] = holder;
				holders[key]!++;
			}
			keys.set(id, key);
			return key;
		};
		for (const record of envelope.records) keyOf(record.id);
		return keys;
	});
	let base = 0;
	for (const envelope of envelopes)
		for (const record of envelope.records) base = Math.max(base, record.id + 1);
	const sharedIds = new Map<number, number>();
	const sharedRecords: SerializedRecord[] = [];
	const sharedId = (key: number): number => {
		let id = sharedIds.get(key);
		if (id !== undefined) return id;
		id = base + sharedIds.size;
		sharedIds.set(key, id);
		const { record, keys } = representative[key]!;
		const at = sharedRecords.push(record) - 1;
		sharedRecords[at] = { ...mapRecordSlots(record, (child) => sharedId(keys.get(child)!)), id };
		return id;
	};
	const rewritten = new Map<Envelope, Envelope>();
	envelopes.forEach((envelope, holder) => {
		const keys = keysByEnvelope[holder]!;
		const root = rootRecordId(envelope);
		const shared = (id: number) => {
			const key = keys.get(id);
			return id !== root && key != null && holders[key]! >= 2 ? key : undefined;
		};
		if (!envelope.records.some((record) => shared(record.id) !== undefined)) return;
		rewritten.set(envelope, {
			...envelope,
			records: envelope.records.flatMap((record) =>
				shared(record.id) !== undefined
					? []
					: [
							mapRecordSlots(record, (id) => {
								const key = shared(id);
								return key === undefined ? id : sharedId(key);
							}),
						],
			),
		});
	});
	return rewritten.size > 0 ? { ...withEnvelopes(state, rewritten), sharedRecords } : state;
}

function rootRecordId(envelope: Envelope): number | undefined {
	const root = envelope.root;
	return typeof root === 'object' && root !== null && '$ref' in root ? root.$ref : undefined;
}
