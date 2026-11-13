import { failSave, saveRow, type Board } from './grid-server.ts';

export default function StatusHeader({ board }: { board: Board }) @{
	<header>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		@if (board.items.length > 1) {
			<p data-g="many">{board.items.length} rows</p>
		} @else {
			<p data-g="one">One row</p>
		}
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
	</header>
}
