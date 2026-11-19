import { state } from '@markless/core';

export default function SpanRows() @{
	let rows = state([
		{ row: 'A', seats: [{ picked: false }, { picked: false }] },
		{ row: 'B', seats: [{ picked: false }, { picked: false }] },
	]);

	<div>
		@for (const row of rows; key row.row) {
			<span>
				@for (const seat of row.seats; index n; key n) {
					<button data-seat={`${row.row}${n + 1}`} aria-pressed={seat.picked} onClick={() => (seat.picked = !seat.picked)}>
						{row.row}{n + 1}
					</button>
				}
			</span>
		}
	</div>
}
