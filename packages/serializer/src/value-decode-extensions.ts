import type { ValueDecodeExtensions } from './value-decode-client.ts';
import type { SerializedRecord, SerializedSlot } from './value.ts';

type TypedArrayConstructor = new (
	buffer: ArrayBuffer,
	byteOffset: number,
	length: number,
) => unknown;

export const valueDecodeExtensions: ValueDecodeExtensions = {
	recordShell(record, shells) {
		if (record.type === 'regexp') return new RegExp(record.source, record.flags);
		if (record.type === 'url') return new URL(record.value);
		if (record.type === 'array-buffer') return new Uint8Array(record.bytes).buffer;
		if (record.type === 'typed-array') return createTypedArray(record, shells);
		if (record.type === 'data-view') return createDataView(record, shells);
	},
	slot(slot) {
		if (typeof slot !== 'object' || slot === null || !('$type' in slot)) return undefined;
		if (slot.$type === 'regexp') return new RegExp(slot.source, slot.flags);
		if (slot.$type === 'url') return new URL(slot.value);
	},
};

function createTypedArray(
	record: Extract<SerializedRecord, { readonly type: 'typed-array' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	if (!(buffer instanceof ArrayBuffer)) return undefined;
	const constructor = (globalThis as Record<string, unknown>)[record.arrayType];
	return typeof constructor === 'function'
		? new (constructor as TypedArrayConstructor)(buffer, record.byteOffset, record.length)
		: undefined;
}

function createDataView(
	record: Extract<SerializedRecord, { readonly type: 'data-view' }>,
	shells: ReadonlyMap<number, unknown>,
): unknown {
	const buffer = decodeSlot(record.buffer, shells);
	return buffer instanceof ArrayBuffer
		? new DataView(buffer, record.byteOffset, record.byteLength)
		: undefined;
}

function decodeSlot(slot: SerializedSlot, shells: ReadonlyMap<number, unknown>): unknown {
	if (typeof slot !== 'object' || slot === null) return slot;
	if ('$ref' in slot) return shells.get(slot.$ref);
	if (slot.$type === 'regexp') return new RegExp(slot.source, slot.flags);
	if (slot.$type === 'url') return new URL(slot.value);
}
