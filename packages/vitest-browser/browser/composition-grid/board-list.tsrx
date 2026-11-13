import { computed } from '@markless/core';
import { failSave, saveRow, type Board } from './grid-server.ts';

export default function BoardList({ board }: { board: Board }) @{
	const count = computed(() => `${board.items.length} rows`);

	<section>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<p data-g="count">{count}</p>
		<ul>
			@for (const row of board.items; key row.id) {
				<li data-g="row">{row.label}</li>
			}
		</ul>
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
	</section>
}
