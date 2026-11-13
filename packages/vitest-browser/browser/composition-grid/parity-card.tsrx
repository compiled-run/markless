import { computed } from '@markless/core';
import { derive, failSave, saveRow, type Board } from './grid-server.ts';

export function EvenCard({ board }: { board: Board }) @{
	const label = computed(() => derive('even', board));

	<article>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<p data-g="card">{label}</p>
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
	</article>
}

export function OddCard({ board }: { board: Board }) @{
	const label = computed(() => derive('odd', board));

	<aside>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
		<p data-g="card">{label}</p>
		<h3 data-g="title" class={board.parity}>{board.title}</h3>
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
	</aside>
}
