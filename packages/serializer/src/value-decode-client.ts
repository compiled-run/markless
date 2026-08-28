import type { SerializedGraphPayload, SerializedRecord, SerializedSlot } from './value.ts';

export type { SerializedGraphPayload, SerializedRecord, SerializedSlot } from './value.ts';

export type ValueDecodeExtensions = {
	readonly recordShell: (
		record: SerializedRecord,
		shells: ReadonlyMap<number, unknown>,
	) => unknown;
	readonly slot: (slot: SerializedSlot) => unknown;
};

export async function deserializeGraphValueForClient(
	payload: SerializedGraphPayload,
): Promise<unknown> {
	const extensions = payloadNeedsExtendedDecoders(payload)
		? (await import('./value-decode-extensions.ts')).valueDecodeExtensions
		: undefined;
	return deserializeGraphValueWithExtensions(payload, extensions);
}

function deserializeGraphValueWithExtensions(
	payload: SerializedGraphPayload,
	extensions?: ValueDecodeExtensions,
): unknown {
	const shells = new Map<number, unknown>();

	for (const record of payload.records) {
		if (record.type === 'object') shells.set(record.id, {});
		if (record.type === 'array') shells.set(record.id, []);
		if (record.type === 'map') shells.set(record.id, new Map());
		if (record.type === 'set') shells.set(record.id, new Set());
		if (record.type === 'date') shells.set(record.id, new Date(record.value));
		const shell = extensions?.recordShell(record, shells);
		if (shell !== undefined) shells.set(record.id, shell);
	}

	for (const record of payload.records) {
		if (record.type === 'typed-array' || record.type === 'data-view') {
			const shell = extensions?.recordShell(record, shells);
			if (shell !== undefined) shells.set(record.id, shell);
		}
	}

	for (const record of payload.records) {
		const shell = shells.get(record.id);
		if (record.type === 'object') {
			const object = shell as Record<string, unknown>;
			for (const [key, slot] of record.fields) {
				object[key] = decodeSlot(slot, shells, extensions);
			}
		}
		if (record.type === 'array') {
			const array = shell as unknown[];
			for (const item of record.items) array.push(decodeSlot(item, shells, extensions));
		}
		if (record.type === 'map') {
			const map = shell as Map<unknown, unknown>;
			for (const [key, value] of record.entries) {
				map.set(decodeSlot(key, shells, extensions), decodeSlot(value, shells, extensions));
			}
		}
		if (record.type === 'set') {
			const set = shell as Set<unknown>;
			for (const value of record.values) set.add(decodeSlot(value, shells, extensions));
		}
	}

	return decodeSlot(payload.root, shells, extensions);
}

function decodeSlot(
	slot: SerializedSlot,
	shells: ReadonlyMap<number, unknown>,
	extensions?: ValueDecodeExtensions,
): unknown {
	if (
		slot === null ||
		typeof slot === 'string' ||
		typeof slot === 'number' ||
		typeof slot === 'boolean'
	)
		return slot;
	if ('$ref' in slot) return shells.get(slot.$ref);
	if (slot.$type === 'undefined') return undefined;
	if (slot.$type === 'bigint') return BigInt(slot.value);
	if (slot.$type === 'number') return Number(slot.value);
	if (slot.$type === 'date') return new Date(slot.value);
	return extensions?.slot(slot);
}

function payloadNeedsExtendedDecoders(payload: SerializedGraphPayload): boolean {
	if (slotNeedsExtendedDecoder(payload.root)) return true;
	return payload.records.some((record) => {
		if (
			record.type === 'regexp' ||
			record.type === 'url' ||
			record.type === 'array-buffer' ||
			record.type === 'typed-array' ||
			record.type === 'data-view'
		)
			return true;
		if (record.type === 'object') {
			return record.fields.some(([, slot]) => slotNeedsExtendedDecoder(slot));
		}
		if (record.type === 'array') return record.items.some(slotNeedsExtendedDecoder);
		if (record.type === 'map') {
			return record.entries.some(
				([key, value]) => slotNeedsExtendedDecoder(key) || slotNeedsExtendedDecoder(value),
			);
		}
		if (record.type === 'set') return record.values.some(slotNeedsExtendedDecoder);
		return false;
	});
}

function slotNeedsExtendedDecoder(slot: SerializedSlot): boolean {
	return (
		typeof slot === 'object' &&
		slot !== null &&
		'$type' in slot &&
		(slot.$type === 'regexp' || slot.$type === 'url')
	);
}
