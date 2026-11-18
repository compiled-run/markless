import { computed } from '@markless/core';
import { failSave, saveRow, type Board } from './grid-server.ts';

export default function ListingCache({ board }: { board: Board }) @{
	const shown = computed(() => board.items.map((row) => ({ id: row.id, text: row.label.toUpperCase() })));

	<div>
		<ul>
			@for (const row of shown; key row.id) {
				<li data-g="row">{row.text}</li>
			}
		</ul>
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
	</div>
}
