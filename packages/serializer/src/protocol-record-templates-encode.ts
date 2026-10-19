import type { RuntimePayloadType } from './protocol-client.ts';
import {
	PROTOCOL_TEMPLATED_LISTS,
	type ProtocolTemplatedRecords,
} from './protocol-record-templates.ts';

// Per-record values are digit runs and keyed-row segments; every other byte is the record's shape.
const HOLE = /\d+|r:[^:"\\]*:/g;
const WHOLE_NUMBER = /^(?:0|[1-9]\d{0,14})$/;
// Gzip already folds a few repeats, so a list is templated only once that saves a quarter of it.
const TEMPLATED_SHARE = 0.75;

type Group = {
	readonly key: string;
	readonly rows: Array<RegExpMatchArray | null>;
	readonly members: number[];
};

/**
 * Serves a record list as templates when that is shorter: records that differ only in their
 * values share one shape, and each carries only the values that differ between them.
 */
export function encodeRecordTemplates<T extends object>(
	records: ReadonlyArray<T>,
): ReadonlyArray<T> | ProtocolTemplatedRecords {
	if (records.length < 2) return records;
	const groups = new Map<string, Group>();
	const texts: string[] = [];
	for (let index = 0; index < records.length; index++) {
		let text = JSON.stringify(records[index]);
		if (text.includes('^')) text = text.replaceAll('^', '\\u005e');
		texts.push(text);
		const values = text.match(HOLE);
		const key = values ? text.replace(HOLE, '^') : text;
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { key, rows: [], members: [] }));
		group.rows.push(values);
		group.members.push(index);
	}
	if (groups.size === records.length) return records;
	const templates: string[] = [];
	const refs: Array<ProtocolTemplatedRecords['r'][number]> = [];
	for (const group of groups.values()) {
		if (group.rows.length === 1) {
			refs[group.members[0]!] = records[group.members[0]!]!;
			continue;
		}
		const index = templates.length;
		const first = group.rows[0];
		const slots = first
			? valueSlots(group.rows as RegExpMatchArray[])
			: { of: [], columns: [] };
		const parts = group.key.split('^');
		let text = parts[0]!;
		for (let column = 0; column < parts.length - 1; column++) {
			const slot = slots.of[column]!;
			text += (slot < 0 ? first![column] : `^${slot}`) + parts[column + 1];
		}
		templates.push(text);
		group.rows.forEach((values, row) => {
			refs[group.members[row]!] = slots.columns.length
				? [
						index,
						...slots.columns.map((column) => {
							const value = values![column]!;
							return WHOLE_NUMBER.test(value) ? Number(value) : value;
						}),
					]
				: index;
		});
	}
	const encoded = { t: templates, r: refs };
	const plain = texts.reduce((total, text) => total + text.length + 1, 1);
	return JSON.stringify(encoded).length <= plain * TEMPLATED_SHARE ? encoded : records;
}

// A value every row shares stays in the template; columns equal in every row share one slot.
function valueSlots(rows: ReadonlyArray<RegExpMatchArray>) {
	const width = rows[0]!.length;
	const of: number[] = [];
	const columns: number[] = [];
	for (let column = 0; column < width; column++) {
		const value = rows[0]![column];
		if (rows.every((row) => row[column] === value)) {
			of.push(-1);
			continue;
		}
		const same = columns.findIndex((held) => rows.every((row) => row[held] === row[column]));
		of.push(same >= 0 ? same : columns.push(column) - 1);
	}
	return { of, columns };
}

/** The payload with each templated list served in its shorter form, for JSON.stringify. */
export function encodeProtocolPayloadLists<T extends object>(
	type: RuntimePayloadType,
	payload: T,
): T {
	let encoded: Record<string, unknown> | undefined;
	for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
		const list = (payload as Record<string, unknown>)[key];
		if (!Array.isArray(list)) continue;
		const served = encodeRecordTemplates(list);
		if (served !== list)
			(encoded ??= { ...(payload as Record<string, unknown>) })[key] = served;
	}
	return (encoded as T | undefined) ?? payload;
}
