import type { RuntimePayloadType } from './protocol-client.ts';
import type {
	ProtocolInstancePaths,
	ProtocolServedRecords,
	ProtocolTemplatedRecords,
} from './protocol.ts';
import { PROTOCOL_RECORD_KEYS } from './protocol-record-keys.ts';
import { PROTOCOL_TEMPLATED_LISTS } from './protocol-templated-lists.ts';
import { expandSharedRecords } from './protocol-shared-records-decode.ts';

export { PROTOCOL_TEMPLATED_LISTS };

export type { RuntimePayloadType };

export type { ProtocolInstancePaths, ProtocolServedRecords, ProtocolTemplatedRecords };

/**
 * Expands one served record list. Self-contained, because the inline resumer embeds its source to
 * read the state cells a sync policy tests.
 */
export function expandRecordTemplates(
	list: ProtocolServedRecords,
	keys = '',
	instancePaths: ProtocolInstancePaths = [],
): unknown[] {
	if (Array.isArray(list)) return list as unknown[];
	const { t, r } = list as ProtocolTemplatedRecords;
	const names = keys.split(' ');
	const paths: string[] = [];
	const path = (at: number): string => {
		const entry = instancePaths[at]!;
		return (paths[at] ??= typeof entry === 'string' ? entry : path(entry[0]) + entry[1]);
	};
	const parts = t.map((text) =>
		text.replace(/~(\d+):/g, (_, at: string) => `"${names[+at]}":`).split(/([\^`])(\d+)/),
	);
	// One parse for the whole list: a parse per record costs more than the text it reads.
	const texts: string[] = [];
	const filled: number[] = [];
	const records = r.map((ref, index) => {
		if (typeof ref !== 'number' && !Array.isArray(ref)) return ref;
		const part = parts[typeof ref === 'number' ? ref : (ref[0] as number)]!;
		let text = part[0]!;
		for (let at = 1; at < part.length; at += 3) {
			const value = (ref as ReadonlyArray<number | string>)[+part[at + 1]! + 1]!;
			text += (part[at] === '`' ? path(value as number) : value) + part[at + 2]!;
		}
		texts.push(text);
		filled.push(index);
		return undefined;
	});
	const parsed = JSON.parse(`[${texts.join(',')}]`) as unknown[];
	filled.forEach((index, at) => (records[index] = parsed[at]!));
	return records;
}

/** Expands, in place, every templated list of a freshly parsed payload script. */
export function decodeProtocolPayloadLists<T>(type: RuntimePayloadType, payload: T): T {
	const record = payload as Record<string, unknown> | null;
	const keys: Readonly<Record<string, string>> = PROTOCOL_RECORD_KEYS[type];
	if (record) {
		const paths = record.instancePaths as ProtocolInstancePaths | undefined;
		for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
			const list = record[key];
			if (list && !Array.isArray(list))
				record[key] = expandRecordTemplates(
					list as ProtocolTemplatedRecords,
					keys[key],
					paths,
				);
		}
		delete record.instancePaths;
	}
	return expandSharedRecords(payload);
}
