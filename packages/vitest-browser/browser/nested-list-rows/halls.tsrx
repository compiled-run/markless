import { state } from '@markless/core';

type Seat = { id: string; taken: boolean };

export default function Halls() @{
	let halls = state([
		{ name: 'h1', rows: [{ label: 'A', seats: [{ id: 'h1A1', taken: false }, { id: 'h1A2', taken: false }] }] },
		{
			name: 'h2',
			rows: [
				{ label: 'A', seats: [{ id: 'h2A1', taken: false }] },
				{ label: 'B', seats: [{ id: 'h2B1', taken: false }, { id: 'h2B2', taken: false }] },
			],
		},
	]);
	let rows = state([
		{ label: 'A', seats: [{ id: 'A1', taken: false }, { id: 'A2', taken: false }] },
		{ label: 'B', seats: [{ id: 'B1', taken: false }] },
	]);
	function take(id: string) {
		for (const hall of halls) {
			for (const row of hall.rows) {
				for (const seat of row.seats) if (seat.id === id) seat.taken = !seat.taken;
			}
		}
	}

	<main>
		<section>
			@for (const hall of halls; key hall.name) {
				<div data-hall={hall.name}>
					@for (const row of hall.rows; key row.label) {
						<p>
							@for (const seat of row.seats; key seat.id) {
								<button data-seat={seat.id} aria-pressed={seat.taken} onClick={() => take(seat.id)}>
									{seat.id}
								</button>
							}
						</p>
					}
				</div>
			}
		</section>
		<section>
			@for (const row of rows; key row.label) {
				<p data-row={row.label}>
					@for (const seat of row.seats; key seat.id) {
						<span data-pick={seat.id}>{seat.taken ? 'x' : 'o'}</span>
					}
				</p>
			}
		</section>
		<button
			data-find
			onClick={() => {
				for (const row of rows) {
					const hit = row.seats.find((seat: Seat) => seat.id.endsWith('1'));
					if (hit) hit.taken = true;
				}
			}}
		>
			find
		</button>
		<button
			data-drop-then-write
			onClick={async () => {
				for (const row of rows) {
					if (row.label !== 'A') continue;
					for (const seat of row.seats) {
						rows = rows.filter((other) => other.label !== 'A');
						await Promise.resolve();
						seat.taken = false;
						return;
					}
				}
			}}
		>
			drop then write
		</button>
	</main>
}
