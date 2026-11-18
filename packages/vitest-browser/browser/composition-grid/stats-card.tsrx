import { computed } from '@markless/core';
import { failSave, loadBoard, saveRow } from './grid-server.ts';

export default function StatsCard({ subject, round }: { subject: string; round: number }) @{
	const board = computed(async () => await loadBoard(subject, round));

	<section>
		@try {
			<div>
				<h2 data-g="title" class={board.parity}>{board.title}</h2>
				<ul>
					@for (const row of board.items; key row.id) {
						<li data-g="row">{row.label}</li>
					}
				</ul>
				<button type="button" data-grid-save onClick={async () => await saveRow(board.subject)}>Save</button>
				<button type="button" data-grid-fail onClick={async () => await failSave(board.subject)}>Fail</button>
			</div>
		} @pending {
			<p data-g="pending">Loading</p>
		} @catch (error, reset) {
			<>
				<p data-g="failed">{error.message}</p>
				<button type="button" data-grid-reset onClick={() => reset()}>Retry</button>
			</>
		}
	</section>
}
