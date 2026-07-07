import type { DomJournalEntry, DomJournalResult } from './graph.ts';

export type DirtyPath = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export function appendJournalResult(
	journal: DomJournalEntry[],
	result: DomJournalResult | void,
): void {
	if (!result) return;
	if (isDomJournalEntryArray(result)) {
		journal.push(...result);
		return;
	}

	journal.push(result);
}

export function scheduleMicrotask(callback: () => void): void {
	if (typeof queueMicrotask === 'function') {
		queueMicrotask(callback);
		return;
	}

	void Promise.resolve().then(callback);
}

function isDomJournalEntryArray(
	result: DomJournalResult,
): result is ReadonlyArray<DomJournalEntry> {
	return Array.isArray(result);
}
