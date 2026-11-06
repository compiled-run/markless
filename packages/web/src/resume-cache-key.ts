import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import { serializeGraphValue } from '../../serializer/src/value.ts';

type Read = (graphNodeId: string, path: ReadonlyArray<string>) => unknown;
type AsyncRead = { readonly graphNodeId: string };

/** One stored seed: the dependency key it was fetched for, its state patch, and the settled arm a served page fills in. */
export type ResumeCacheEntry = {
	readonly k: string;
	readonly s: Pick<ProtocolStatePayload, 'cells' | 'computed'>;
	readonly h?: string;
	readonly a?: unknown;
};

// The async values a boundary reads, each a computed of the page's own state.
export function boundaryAsyncRecords(
	state: Pick<ProtocolStatePayload, 'computed'>,
	reads: ReadonlyArray<AsyncRead>,
): Array<ProtocolStatePayload['computed'][number]> | undefined {
	const records = [];
	for (const graphNodeId of new Set(reads.map((read) => read.graphNodeId))) {
		const record = state.computed.find((computed) => computed.graphNodeId === graphNodeId);
		if (!record?.async) return undefined;
		records.push(record);
	}
	return records.length > 0 ? records : undefined;
}

/**
 * The values a boundary's async computeds were fetched with, as one string the server and the browser spell alike.
 * A value fetched from another async value has no key: its seed would be as old as two fetches.
 */
export function resumeCacheDependencyKey(
	state: Pick<ProtocolStatePayload, 'computed'>,
	reads: ReadonlyArray<AsyncRead>,
	read: Read,
): string | undefined {
	const records = boundaryAsyncRecords(state, reads);
	if (!records) return undefined;
	const values: unknown[] = [];
	for (const record of records)
		for (const dependency of record.dependencies ?? []) {
			if (state.computed.some((other) => other.graphNodeId === dependency.graphNodeId && other.async))
				return undefined;
			values.push(read(dependency.graphNodeId, dependency.path));
		}
	const serialized = serializeGraphValue(values);
	return serialized.ok ? JSON.stringify(serialized.payload) : undefined;
}

/** `exclude` entries name async computeds; a trailing `*` matches every name it starts. */
export function resumeCacheExcludes(
	exclude: ReadonlyArray<string>,
	records: ReadonlyArray<{ readonly name: string }>,
): boolean {
	return records.some((record) =>
		exclude.some((pattern) =>
			pattern.endsWith('*') ? record.name.startsWith(pattern.slice(0, -1)) : record.name === pattern,
		),
	);
}

export function parseResumeCacheEntry(raw: string): ResumeCacheEntry | undefined {
	try {
		const entry = JSON.parse(raw) as Partial<ResumeCacheEntry> | null;
		return typeof entry?.k === 'string' && Array.isArray(entry.s?.computed) && Array.isArray(entry.s?.cells)
			? (entry as ResumeCacheEntry)
			: undefined;
	} catch {
		return undefined;
	}
}
