import type { DomJournalEntry } from '@markless/runtime';
import { marklessAttributeValue } from './dom-attribute.ts';
import { marklessControlWriteHeld } from './control-edit-hold.ts';

type DirectJournalTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

export function isDirectJournalEntry(entry: DomJournalEntry): boolean {
	return entry.type === 'setText' || entry.type === 'setAttr' || entry.type === 'setProp';
}

/**
 * Writes the entries that touch one element where they stand, with no module to
 * load first, and hands back the range work it leaves for the full journal.
 */
export function applyDirectJournalEntries(
	entries: ReadonlyArray<DomJournalEntry>,
	resolveElement: (locator: string) => unknown,
): DomJournalEntry[] {
	const deferred: DomJournalEntry[] = [];
	for (const entry of entries) {
		if (entry.type !== 'setText' && entry.type !== 'setAttr' && entry.type !== 'setProp') {
			deferred.push(entry);
			continue;
		}
		const target = resolveElement(String(entry.locator)) as DirectJournalTarget | undefined;
		if (!target) continue;
		if (entry.type === 'setText') {
			const node = (entry.node ? entry.node(target) : target) as DirectJournalTarget;
			const text = entry.value == null ? '' : String(entry.value);
			// A rewrite with the value already there is still a mutation, and an aria-live region announces on it.
			if (node.textContent !== text) node.textContent = text;
		} else if (entry.type === 'setAttr') {
			const text = marklessAttributeValue(entry.name, entry.value);
			if (text === null) target.removeAttribute?.(entry.name);
			else target.setAttribute?.(entry.name, text);
		} else if (!marklessControlWriteHeld(target, entry.name, entry.value)) {
			(target as Record<string, unknown>)[entry.name] = entry.value;
		}
	}
	return deferred;
}
