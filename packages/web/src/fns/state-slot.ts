export function marklessSerializeSlot(value, records, seen) {
	if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
	if (value === undefined) return { $type: 'undefined' };
	if (typeof value === 'bigint') return { $type: 'bigint', value: String(value) };
	if (typeof value === 'function' || typeof value === 'symbol') throw new Error('MARKLESS_SERIALIZE_UNSUPPORTED_VALUE');
	if (seen.has(value)) return { $ref: seen.get(value) };
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
		const record = { id, type: 'array', items: [] };
		records.push(record);
		for (const item of value) record.items.push(marklessSerializeSlot(item, records, seen));
		return { $ref: id };
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) throw new Error('MARKLESS_SERIALIZE_UNSUPPORTED_VALUE');
	const record = { id, type: 'object', fields: [] };
	records.push(record);
	for (const key of Object.keys(value)) record.fields.push([key, marklessSerializeSlot(value[key], records, seen)]);
	return { $ref: id };
}
