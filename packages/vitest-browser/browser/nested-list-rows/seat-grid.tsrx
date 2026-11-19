import { state } from '@markless/core';

type Seat = { sold?: boolean; picked?: boolean };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export default function SeatGrid() @{
	let rows = state<Seat[][]>([
		[{}, {}, { sold: true }],
		[{}, { sold: true }, {}],
	]);
	function clear() {
		for (const row of rows) for (const seat of row) seat.picked = false;
	}

	<main>
		<div class="grid">
			@for (const row of rows; index r; key r) {
				<div class="row" data-row={r}>
					@for (const seat of row; index n; key n) {
						<button data-seat={`${r}-${n}`} aria-pressed={!!seat.picked} onClick={() => (seat.picked = !seat.picked)}>
							{LETTERS[r]}{n + 1}
						</button>
					}
				</div>
			}
		</div>
		<button data-clear onClick={clear}>Clear</button>
		<button data-add onClick={() => rows.push([{}, { picked: true }])}>Add row</button>
		<button data-drop onClick={() => rows.splice(0, 1)}>Drop first row</button>
	</main>
}
