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

// Self-contained: the inline resumer embeds its source.
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
	return r.map((ref) => {
		if (typeof ref === 'number') return JSON.parse(parts[ref]![0]!);
		if (!Array.isArray(ref)) return ref;
		const part = parts[ref[0] as number]!;
		let text = part[0]!;
		for (let at = 1; at < part.length; at += 3) {
			const value = ref[+part[at + 1]! + 1]!;
			text += (part[at] === '`' ? path(value as number) : value) + part[at + 2]!;
		}
		return JSON.parse(text);
	});
}

/** Expands, in place, every templated list of a freshly parsed payload script. */
export function decodeProtocolPayloadLists<T>(type: RuntimePayloadType, payload: T): T {
	const record = payload as Record<string, unknown> | null;
	const keys: Readonly<Record<string, string>> = PROTOCOL_RECORD_KEYS[type];
	if (record) {
		const paths = record.instancePaths as ProtocolInstancePaths | undefined;
		const inRows = record.inRows as Record<string, ProtocolTemplatedRecords> | undefined;
		for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
			const list = record[key];
			if (list && !Array.isArray(list))
				record[key] = expandRecordTemplates(list as ProtocolTemplatedRecords, keys[key], paths);
			const rows = inRows?.[key] && expandRecordTemplates(inRows[key], keys[key], paths);
			let at = 0;
			if (rows) record[key] = (list as unknown[]).map((item) => item ?? rows[at++]);
		}
		delete record.instancePaths;
		delete record.inRows;
	}
	return expandSharedRecords(payload);
}
