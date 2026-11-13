import { computed } from '@markless/core';
import { EntryLine } from './entry-line.tsrx';
import { failSave, saveRow, type Board } from './grid-server.ts';

export function SortedEntries({ ledger }: { ledger: Board }) @{
	const newestFirst = computed(() => [...ledger.items].reverse());

	<div>
		<button type="button" data-grid-fail onClick={async () => await failSave(ledger.subject)}>Try</button>
		@for (const entry of newestFirst; index place; key entry.id) {
			<EntryLine entry={entry} place={place + 1} />
		}
		<h3 class={ledger.parity} data-g="title">{ledger.title}</h3>
		<button type="button" data-grid-save onClick={async () => await saveRow(ledger.subject)}>Keep</button>
	</div>
}
