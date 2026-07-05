import type { SerializedGraphPayload, SerializedRecord, SerializedSlot } from './value.ts';

export type { SerializedGraphPayload, SerializedRecord, SerializedSlot } from './value.ts';

export function deserializeGraphValue(payload: SerializedGraphPayload): unknown {
	const shells = new Map<number, unknown>();

	for (const record of payload.records) {
		if (record.type === 'object') shells.set(record.id, {});
		if (record.type === 'array') shells.set(record.id, []);
		if (record.type === 'map') shells.set(record.id, new Map());
		if (record.type === 'set') shells.set(record.id, new Set());
		if (record.type === 'date') shells.set(record.id, new Date(record.value));
		if (record.type === 'regexp') {
			shells.set(record.id, new RegExp(record.source, record.flags));
		}
		if (record.type === 'url') shells.set(record.id, new URL(record.value));
		if (record.type === 'array-buffer') {
			shells.set(record.id, new Uint8Array(record.bytes).buffer);
		}
	}

	for (const record of payload.records) {
		if (record.type === 'typed-array') {
			shells.set(record.id, createTypedArray(record, shells));
		}
		if (record.type === 'data-view') {
			shells.set(record.id, createDataView(record, shells));
		}
	}

	for (const record of payload.records) {
		const shell = shells.get(record.id);

		if (record.type === 'object') {
			const object = shell as Record<string, unknown>;
			for (const [key, slot] of record.fields) {
				object[key] = decodeSlot(slot, shells);
			}
		}

		if (record.type === 'array') {
			const array = shell as unknown[];
			for (const item of record.items) {
				array.push(decodeSlot(item, shells));
			}
		}

		if (record.type === 'map') {
			const map = shell as Map<unknown, unknown>;
			for (const [key, value] of record.entries) {
				map.set(decodeSlot(key, shells), decodeSlot(value, shells));
			}
		}

		if (record.type === 'set') {
			const set = shell as Set<unknown>;
			for (const value of record.values) {
				set.add(decodeSlot(value, shells));
			}
		}
	}

	return decodeSlot(payload.root, shells);
}

function decodeSlot(slot: SerializedSlot, shells: ReadonlyMap<number, unknown>): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	) {
		return slot;
	}

	if ('$ref' in slot) return shells.get(slot.$ref);
	if (slot.$type === 'undefined') return undefined;
	if (slot.$type === 'bigint') return BigInt(slot.value);
	if (slot.$type === 'date') return new Date(slot.value);
	if (slot.$type === 'regexp') return new RegExp(slot.source, slot.flags);
	if (slot.$type === 'url') return new URL(slot.value);

	return undefined;
}

function createTypedArray(
	record: Extract<SerializedRecord, { readonly type: 'typed-array' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return undefined;

	if (record.arrayType === 'Int8Array') {
		return new Int8Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint8Array') {
		return new Uint8Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint8ClampedArray') {
		return new Uint8ClampedArray(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Int16Array') {
		return new Int16Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint16Array') {
		return new Uint16Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Int32Array') {
		return new Int32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Uint32Array') {
		return new Uint32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Float32Array') {
		return new Float32Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'Float64Array') {
		return new Float64Array(buffer, record.byteOffset, record.length);
	}
	if (record.arrayType === 'BigInt64Array') {
		return new BigInt64Array(buffer, record.byteOffset, record.length);
	}

	return new BigUint64Array(buffer, record.byteOffset, record.length);
}

function createDataView(
	record: Extract<SerializedRecord, { readonly type: 'data-view' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return undefined;

	return new DataView(buffer, record.byteOffset, record.byteLength);
}
