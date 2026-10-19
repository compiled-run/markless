import type { RuntimePayloadType } from './protocol-client.ts';
import { PROTOCOL_RECORD_KEYS } from './protocol-record-keys.ts';
import { PROTOCOL_TEMPLATED_LISTS } from './protocol-templated-lists.ts';

export { PROTOCOL_TEMPLATED_LISTS };

export type { RuntimePayloadType };

/**
 * A record list served as templates. `t` holds each distinct record shape as JSON text whose
 * per-record values are `^<slot>` holes and whose field names the list's generated key table
 * spells are `~<index>:` references; each `r` entry is a template index (no values), a
 * `[template, ...values]` row filling the holes in order, or a record no other record shares.
 */
export type ProtocolTemplatedRecords = {
	readonly t: ReadonlyArray<string>;
	readonly r: ReadonlyArray<number | ReadonlyArray<number | string> | object>;
};

/** A record list as a payload script serves it: a plain array, or templates. */
export type ProtocolServedRecords = ReadonlyArray<unknown> | ProtocolTemplatedRecords;

export function expandRecordTemplates(list: ProtocolServedRecords, keys = ''): unknown[] {
	if (Array.isArray(list)) return list as unknown[];
	const { t, r } = list as ProtocolTemplatedRecords;
	const names = keys.split(' ');
	const parts = t.map((text) =>
		text.replace(/~(\d+):/g, (_, at: string) => `"${names[+at]}":`).split(/\^(\d+)/),
	);
	return r.map((ref) => {
		if (typeof ref === 'number') return JSON.parse(parts[ref]![0]!);
		if (!Array.isArray(ref)) return ref;
		const part = parts[ref[0] as number]!;
		let text = part[0]!;
		for (let at = 1; at < part.length; at += 2) text += ref[+part[at]! + 1]! + part[at + 1]!;
		return JSON.parse(text);
	});
}

/** Expands, in place, every templated list of a freshly parsed payload script. */
export function decodeProtocolPayloadLists<T>(type: RuntimePayloadType, payload: T): T {
	const record = payload as Record<string, unknown> | null;
	const keys: Readonly<Record<string, string>> = PROTOCOL_RECORD_KEYS[type];
	if (record)
		for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
			const list = record[key];
			if (list && !Array.isArray(list))
				record[key] = expandRecordTemplates(list as ProtocolTemplatedRecords, keys[key]);
		}
	return payload;
}
