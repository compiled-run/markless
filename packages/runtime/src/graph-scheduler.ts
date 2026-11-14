import type { DomJournalEntry, DomJournalResult } from './graph.ts';

export type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export function appendJournalResult(
	journal: DomJournalEntry[],
	result: DomJournalResult | void,
): void {
	if (Array.isArray(result)) journal.push(...(result as ReadonlyArray<DomJournalEntry>));
	else if (result) journal.push(result as DomJournalEntry);
}

const ASYNC_SHOWN_FIELDS = ['status', 'version', 'quiet', 'key', 'error', 'writeFailed', 'pageLeft'];

/** The fields an async commit moved that say how its block shows, beside its value. */
export function asyncShownPaths(previous: object, next: object): string[][] {
	const was = previous as Record<string, unknown>;
	const now = next as Record<string, unknown>;
	return ASYNC_SHOWN_FIELDS.filter((field) =>
		field === 'quiet' ? !was.quiet !== !now.quiet : !Object.is(was[field], now[field]),
	).map((field) => [field]);
}

/** A commit that carries the shown value forward: a pending flip, or one that puts the shown value back (`kept`). */
export function asyncCarriesValue(previous: object, next: object, kept: boolean): boolean {
	const now = next as { readonly status?: unknown; readonly value?: unknown };
	return (now.status === 'pending' || kept) && Object.is((previous as { readonly value?: unknown }).value, now.value);
}

export function isAsyncSnapshotMetaKey(key: string | undefined): boolean {
	return key !== undefined && /^(?:status|version|key|error|value)$/.test(key);
}
