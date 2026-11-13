import { computed } from '@markless/core';
import { failSave, saveRow, type Board } from './grid-server.ts';

export function EntryTable({ entries }: { entries: Board }) @{
	const tally = computed(() => entries.items.length);

	<div>
		<button type="button" data-grid-fail onClick={async () => await failSave(entries.subject)}>Try</button>
		<h3 class={entries.parity} data-g="title">{entries.title}</h3>
		<span data-g="count">{tally} rows</span>
		<ol>
			@for (const entry of entries.items; key entry.id) {
				<li data-g="row">{entry.label}</li>
			}
		</ol>
		<button type="button" data-grid-save onClick={async () => await saveRow(entries.subject)}>Keep</button>
	</div>
}
