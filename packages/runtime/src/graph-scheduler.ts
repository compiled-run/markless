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

export const ASYNC_SNAPSHOT_META_KEYS = new Set('status version key error value'.split(' '));
