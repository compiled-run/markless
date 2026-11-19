import { state } from '@markless/core';

export default function NamedRows() @{
	let rows = state([
		{ label: 'A', seats: [{ id: 'A1', picked: true }, { id: 'A2', picked: false }] },
		{ label: 'B', seats: [{ id: 'B1', picked: true }, { id: 'B2', picked: true }] },
	]);
	let cleared = state(0);

	<main>
		@for (const row of rows; key row.label) {
			<p data-label={row.label}>
				@for (const seat of row.seats; key seat.id) {
					<span data-seat={seat.id}>{seat.picked ? 'on' : 'off'}</span>
				}
			</p>
		}
		<output data-cleared>{cleared}</output>
		<button
			data-clear
			onClick={() => {
				for (const row of rows) {
					for (const seat of row.seats) seat.picked = false;
				}
				cleared++;
			}}
		>
			Clear
		</button>
		<button
			data-pick-last
			onClick={() => {
				for (const row of rows) row.seats.forEach((seat) => { if (seat.id.endsWith('2')) seat.picked = true; });
			}}
		>
			Pick last
		</button>
	</main>
}
