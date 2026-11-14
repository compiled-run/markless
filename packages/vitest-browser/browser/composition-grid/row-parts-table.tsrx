import { failSave, saveRow, type Board } from './grid-server.ts';
import RowParts from './row-parts.tsrx';

export default function RowPartsTable({ board }: { board: Board }) @{
	<section>
		<h2 data-g="title" class={board.parity}>{board.title}</h2>
		<ul>
			@for (const row of board.items; key row.id) {
				<RowParts row={row} />
			}
		</ul>
		<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
		<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
	</section>
}
