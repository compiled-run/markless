import type { RuntimePayloadType } from './protocol-client.ts';
import { PROTOCOL_RECORD_KEYS } from './protocol-record-keys.ts';
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

type KeyRefs = (text: string) => string;

const keyRefsByTable = new Map<string, KeyRefs>();

// `"name":` becomes `~<index>:`: a quoted string followed by a colon is only ever a key.
function keyRefs(keys: string): KeyRefs {
	let refs = keyRefsByTable.get(keys);
	if (!refs) {
		const names = keys.split(' ');
		const index = new Map(names.map((name, at) => [name, at]));
		const pattern = new RegExp(
			`"(${names.map((name) => name.replace(/[$]/g, '\\$&')).join('|')})":`,
			'g',
		);
		refs = (text) => text.replace(pattern, (_, name: string) => `~${index.get(name)}:`);
		keyRefsByTable.set(keys, refs);
	}
	return refs;
}

/**
 * Serves a record list as templates when that is shorter: records that differ only in their
 * values share one shape, each carries only the values that differ between them, and every field
 * name the list's key table spells becomes its index there.
 */
export function encodeRecordTemplates<T extends object>(
	records: ReadonlyArray<T>,
	keys = '',
): ReadonlyArray<T> | ProtocolTemplatedRecords {
	if (records.length < 2) return records;
	const refer = keys ? keyRefs(keys) : (text: string) => text;
	const groups = new Map<string, Group>();
	const texts: string[] = [];
	for (let index = 0; index < records.length; index++) {
		let text = JSON.stringify(records[index]);
		if (text.includes('^')) text = text.replaceAll('^', '\\u005e');
		if (text.includes('~')) text = text.replaceAll('~', '\\u007e');
		texts.push(text);
		const values = text.match(HOLE);
		const key = values ? text.replace(HOLE, '^') : text;
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { key, rows: [], members: [] }));
		group.rows.push(values);
		group.members.push(index);
	}
	const templates: string[] = [];
	const refs: Array<ProtocolTemplatedRecords['r'][number]> = [];
	for (const group of groups.values()) {
		if (group.rows.length === 1) {
			const member = group.members[0]!;
			const template = refer(texts[member]!);
			if (JSON.stringify(template).length < texts[member]!.length) {
				refs[member] = templates.length;
				templates.push(template);
			} else refs[member] = records[member]!;
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
		templates.push(refer(text));
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
	const keys: Readonly<Record<string, string>> = PROTOCOL_RECORD_KEYS[type];
	let encoded: Record<string, unknown> | undefined;
	for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
		const list = (payload as Record<string, unknown>)[key];
		if (!Array.isArray(list)) continue;
		const served = encodeRecordTemplates(list, keys[key]);
		if (served !== list)
			(encoded ??= { ...(payload as Record<string, unknown>) })[key] = served;
	}
	return (encoded as T | undefined) ?? payload;
}
