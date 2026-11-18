import { computed, state } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';
import RowDetail from './row-detail.tsrx';

export default function RowDetailPage() @{
	let subject = state('a');
	let round = state(0);
	const board = computed(async () => await loadBoard(subject, round));

	<div>
		<button type="button" data-grid-reload onClick={() => round++}>Reload</button>
		<button type="button" data-grid-subject onClick={() => (subject = subject === 'a' ? 'b' : 'a')}>Other</button>
		@try {
			<section>
				<h2 data-g="title" class={board.parity}>{board.title}</h2>
				<ul>
					@for (const row of board.items; key row.id) {
						<RowDetail row={row} />
					}
				</ul>
				<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
				<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
			</section>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</div>
}
