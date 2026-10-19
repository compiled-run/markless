import type { RuntimePayloadType } from './protocol-client.ts';

export type { RuntimePayloadType };

/** The record lists a payload script may serve as record templates instead of a plain array. */
export const PROTOCOL_TEMPLATED_LISTS = {
	'markless/state': ['computed', 'sharedSeeds', 'sharedDefinitions'],
	'markless/view': ['domUpdates', 'behaviors', 'elementHandles'],
} as const satisfies Record<RuntimePayloadType, ReadonlyArray<string>>;

/**
 * A record list served as templates. `t` holds each distinct record shape as JSON text whose
 * per-record values are `^<slot>` holes; each `r` entry is a template index (no values), a
 * `[template, ...values]` row filling the holes in order, or a record no other record shares.
 */
export type ProtocolTemplatedRecords = {
	readonly t: ReadonlyArray<string>;
	readonly r: ReadonlyArray<number | ReadonlyArray<number | string> | object>;
};

export function expandRecordTemplates(list: ProtocolTemplatedRecords): unknown[] {
	const parts = list.t.map((text) => text.split(/\^(\d+)/));
	return list.r.map((ref) => {
		if (typeof ref === 'number') return JSON.parse(list.t[ref]!);
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
	if (record)
		for (const key of PROTOCOL_TEMPLATED_LISTS[type]) {
			const list = record[key];
			if (list && !Array.isArray(list))
				record[key] = expandRecordTemplates(list as ProtocolTemplatedRecords);
		}
	return payload;
}
