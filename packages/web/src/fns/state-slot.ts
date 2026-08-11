// Slot/record encoding of one graph value: primitives inline, everything with
// identity becomes an indexed record so shared and cyclic references survive.
export type MarklessSerializedSlot =
	| string
	| number
	| boolean
	| null
	| { readonly $type: 'undefined' }
	| { readonly $type: 'bigint'; readonly value: string }
	| { readonly $ref: number };
export type MarklessSerializedRecord =
	| { readonly id: number; readonly type: 'date'; readonly value: string }
	| {
			readonly id: number;
			readonly type: 'regexp';
			readonly source: string;
			readonly flags: string;
	  }
	| { readonly id: number; readonly type: 'url'; readonly value: string }
	| { readonly id: number; readonly type: 'array'; readonly items: MarklessSerializedSlot[] }
	| {
			readonly id: number;
			readonly type: 'object';
			readonly fields: Array<readonly [string, MarklessSerializedSlot]>;
	  };

export function marklessSerializeSlot(
	value: unknown,
	records: MarklessSerializedRecord[],
	seen: Map<unknown, number>,
): MarklessSerializedSlot {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	)
		return value;
	if (value === undefined) return { $type: 'undefined' };
	if (typeof value === 'bigint') return { $type: 'bigint', value: String(value) };
	if (typeof value === 'function' || typeof value === 'symbol')
		throw new Error('MARKLESS_SERIALIZE_UNSUPPORTED_VALUE');
	// The has() guard on the same line is the presence check for this read.
	if (seen.has(value)) return { $ref: seen.get(value)! };
	const id = records.length;
	seen.set(value, id);
	if (value instanceof Date) {
		records.push({ id, type: 'date', value: value.toISOString() });
		return { $ref: id };
	}
	if (value instanceof RegExp) {
		records.push({ id, type: 'regexp', source: value.source, flags: value.flags });
		return { $ref: id };
	}
	if (value instanceof URL) {
		records.push({ id, type: 'url', value: value.toString() });
		return { $ref: id };
	}
	if (Array.isArray(value)) {
		const record: Extract<MarklessSerializedRecord, { readonly type: 'array' }> = {
			id,
			type: 'array',
			items: [],
		};
		records.push(record);
		for (const item of value) record.items.push(marklessSerializeSlot(item, records, seen));
		return { $ref: id };
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null)
		throw new Error('MARKLESS_SERIALIZE_UNSUPPORTED_VALUE');
	const record: Extract<MarklessSerializedRecord, { readonly type: 'object' }> = {
		id,
		type: 'object',
		fields: [],
	};
	records.push(record);
	for (const key of Object.keys(value))
		record.fields.push([
			key,
			marklessSerializeSlot((value as Record<string, unknown>)[key], records, seen),
		]);
	return { $ref: id };
}
