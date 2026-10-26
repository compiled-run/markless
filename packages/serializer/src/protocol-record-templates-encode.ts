import type { RuntimePayloadType } from './protocol-client.ts';
import { PROTOCOL_RECORD_KEYS } from './protocol-record-keys.ts';
import { shareStateRecords } from './protocol-shared-records.ts';
import {
	PROTOCOL_TEMPLATED_LISTS,
	type ProtocolInstancePaths,
	type ProtocolTemplatedRecords,
} from './protocol-record-templates.ts';

// Per-record values are digit runs and keyed-row segments; a keyed row's whole instance path is one value.
const HOLE = /\d+|r:[^:"\\]*:/g;
const PATH_HOLE = /"(?:[cpm]\d+:)*r:[^:"\\]*:(?:[cpm]\d+:|r:[^:"\\]*:)*|\d+|r:[^:"\\]*:/g;
const SEGMENT = /[cpm]\d+:|r:[^:]*:/g;
const WHOLE_NUMBER = /^(?:0|[1-9]\d{0,14})$/;
// Gzip already folds a few repeats, so a list is templated only once that saves a quarter of it.
const TEMPLATED_SHARE = 0.75;
// Readers that load no decoder find these lists' records by id or index: a keyed row's record is served in `inRows`.
const PLAIN_OUTSIDE_ROWS: ReadonlySet<string> = new Set(['cells', 'events']);
const IN_A_ROW = /"(?:[cpm]\d+:)*r:[^:"\\]*:/;

type Group = {
	readonly key: string;
	readonly rows: Array<RegExpMatchArray[]>;
	readonly members: number[];
};

type KeyRefs = (text: string) => string;

/** The instance paths a payload's templated lists hold, by the index their rows name them under. */
export type InstancePathTable = Map<string, number>;

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

const isPath = (hole: string) => hole[0] === '"';

/**
 * Serves a record list as templates when that is shorter: records that differ only in their
 * values share one shape, each carries only the values that differ between them, and every field
 * name the list's key table spells becomes its index there. Given a path table, a keyed row's
 * instance path is one value however deep the row sits, and rows name it by its index there.
 */
export function encodeRecordTemplates<T extends object>(
	records: ReadonlyArray<T>,
	keys = '',
	paths?: InstancePathTable,
): ReadonlyArray<T> | ProtocolTemplatedRecords {
	if (records.length < (paths ? 1 : 2)) return records;
	const refer = keys ? keyRefs(keys) : (text: string) => text;
	const groups = new Map<string, Group>();
	const texts: string[] = [];
	for (let index = 0; index < records.length; index++) {
		let text = JSON.stringify(records[index]);
		if (text.includes('^')) text = text.replaceAll('^', '\\u005e');
		if (text.includes('~')) text = text.replaceAll('~', '\\u007e');
		if (text.includes('`')) text = text.replaceAll('`', '\\u0060');
		texts.push(text);
		const values = [...text.matchAll(paths ? PATH_HOLE : HOLE)];
		let key = '';
		let at = 0;
		for (const hole of values) {
			key += text.slice(at, hole.index) + (isPath(hole[0]) ? '"`' : '^');
			at = hole.index + hole[0].length;
		}
		key += text.slice(at);
		let group = groups.get(key);
		if (!group) groups.set(key, (group = { key, rows: [], members: [] }));
		group.rows.push(values);
		group.members.push(index);
	}
	const known = paths?.size ?? 0;
	const pathIndex = (path: string) => {
		let index = paths!.get(path);
		if (index === undefined) paths!.set(path, (index = paths!.size));
		return index;
	};
	const templates: string[] = [];
	const refs: Array<ProtocolTemplatedRecords['r'][number]> = [];
	for (const group of groups.values()) {
		const first = group.rows[0]!;
		const alone = group.rows.length === 1;
		if (alone && !first.some((hole) => isPath(hole[0]))) {
			const member = group.members[0]!;
			const template = refer(texts[member]!);
			if (JSON.stringify(template).length < texts[member]!.length) {
				refs[member] = templates.length;
				templates.push(template);
			} else refs[member] = records[member]!;
			continue;
		}
		const index = templates.length;
		const slots = valueSlots(group.rows, alone);
		const parts = group.key.split(/\^|"`/);
		let text = parts[0]!;
		for (let column = 0; column < parts.length - 1; column++) {
			const slot = slots.of[column]!;
			const hole = first[column]![0];
			text +=
				(slot < 0 ? hole : isPath(hole) ? `"\`${slot}` : `^${slot}`) + parts[column + 1];
		}
		templates.push(refer(text));
		group.rows.forEach((values, row) => {
			refs[group.members[row]!] = slots.columns.length
				? [
						index,
						...slots.columns.map((column) => {
							const value = values[column]![0];
							if (isPath(value)) return pathIndex(value.slice(1));
							return WHOLE_NUMBER.test(value) ? Number(value) : value;
						}),
					]
				: index;
		});
	}
	const encoded = { t: templates, r: refs };
	const plain = texts.reduce((total, text) => total + text.length + 1, 1);
	let table = 0;
	if (paths) for (const [path, at] of paths) if (at >= known) table += path.length + 3;
	if (JSON.stringify(encoded).length + table <= plain * TEMPLATED_SHARE) return encoded;
	if (paths) for (const [path, at] of paths) if (at >= known) paths.delete(path);
	return records;
}

// A value every row shares, or every value but the paths of a record alone, stays in the template.
function valueSlots(rows: ReadonlyArray<RegExpMatchArray[]>, alone: boolean) {
	const width = rows[0]!.length;
	const of: number[] = [];
	const columns: number[] = [];
	const kind = (column: number) => isPath(rows[0]![column]![0]);
	for (let column = 0; column < width; column++) {
		const value = rows[0]![column]![0];
		if (alone ? !kind(column) : rows.every((row) => row[column]![0] === value)) {
			of.push(-1);
			continue;
		}
		const same = columns.findIndex(
			(held) =>
				kind(held) === kind(column) &&
				rows.every((row) => row[held]![0] === row[column]![0]),
		);
		of.push(same >= 0 ? same : columns.push(column) - 1);
	}
	return { of, columns };
}

/**
 * The served table of a payload's instance paths: a path whose parent instance the table also
 * holds is that entry's index and the segments it adds, so a path costs the same at any depth.
 */
export function encodeInstancePaths(paths: InstancePathTable): ProtocolInstancePaths {
	return [...paths.keys()].map((path) => {
		const segments = path.match(SEGMENT) ?? [];
		for (let length = segments.length - 1; length > 0; length--) {
			const parent = segments.slice(0, length).join('');
			const at = paths.get(parent);
			if (at !== undefined) return [at, path.slice(parent.length)] as const;
		}
		return path;
	});
}

/** The payload with each templated list served in its shorter form, for JSON.stringify. */
export function encodeProtocolPayloadLists<T extends object>(
	type: RuntimePayloadType,
	served: T,
): T {
	const payload = type === 'markless/state' ? shareStateRecords(served) : served;
	const keys: Readonly<Record<string, string>> = PROTOCOL_RECORD_KEYS[type];
	const paths: InstancePathTable = new Map();
	let encoded: Record<string, unknown> | undefined;
	const inRows: Record<string, ProtocolTemplatedRecords> = {};
	for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
		const list = (payload as Record<string, unknown>)[key];
		if (!Array.isArray(list)) continue;
		if (PLAIN_OUTSIDE_ROWS.has(key)) {
			const rows = new Set(list.filter((record) => IN_A_ROW.test(JSON.stringify(record))));
			const served = encodeRecordTemplates([...rows], keys[key], paths);
			if (Array.isArray(served)) continue;
			inRows[key] = served as ProtocolTemplatedRecords;
			(encoded ??= { ...(payload as Record<string, unknown>) })[key] = list.map((record) =>
				rows.has(record) ? null : record,
			);
			continue;
		}
		const served = encodeRecordTemplates(list, keys[key], paths);
		if (served !== list)
			(encoded ??= { ...(payload as Record<string, unknown>) })[key] = served;
	}
	if (encoded && Object.keys(inRows).length) encoded.inRows = inRows;
	if (encoded && paths.size) encoded.instancePaths = encodeInstancePaths(paths);
	return (encoded as T | undefined) ?? payload;
}

type ArmRecords = {
	readonly events?: ReadonlyArray<{ readonly eventName: string; readonly syncPolicy?: unknown }>;
};

/**
 * A streamed arm's record set with its lists served in their shorter form. The stream boot reads the
 * events before any decoder loads: they stay plain while one carries a sync policy, and a templated
 * list travels beside the names the boot listens for.
 */
export function encodeStreamedArmRecords<T extends ArmRecords>(records: T): T {
	const events = records.events ?? [];
	if (events.some((event) => event.syncPolicy))
		return {
			...encodeProtocolPayloadLists('markless/view', { ...records, events: [] }),
			events,
		};
	const served = encodeProtocolPayloadLists('markless/view', records) as T & {
		readonly inRows?: { readonly events?: unknown };
	};
	return served.inRows?.events
		? { ...served, eventNames: [...new Set(events.map((event) => event.eventName))] }
		: served;
}
