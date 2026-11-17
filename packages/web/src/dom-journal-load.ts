import type { DomJournalEntry } from '@markless/runtime';

type RangeJournal = typeof import('./dom-journal.ts');
// Even an evaluated module's import() costs a task.
let rangeJournal: RangeJournal | undefined;
let rangeJournalLoad: Promise<RangeJournal> | undefined;

export function isDirectJournalEntry(entry: DomJournalEntry): boolean {
	return entry.type === 'setText' || entry.type === 'setAttr' || entry.type === 'setProp';
}

/** The journal that moves ranges, loaded once for every applier; a promise only while it still loads. */
export function loadRangeJournal(): RangeJournal | Promise<RangeJournal> {
	return (
		rangeJournal ??
		(rangeJournalLoad ??= import('./dom-journal.ts').then(
			(module) => (rangeJournal = module),
			(error: unknown) => {
				rangeJournalLoad = undefined;
				throw error;
			},
		))
	);
}

/** The range journal's load while `entries` need it and it has not arrived. */
export function rangeJournalCode(entries: ReadonlyArray<DomJournalEntry>): unknown {
	return entries.every(isDirectJournalEntry) ? undefined : loadRangeJournal();
}
