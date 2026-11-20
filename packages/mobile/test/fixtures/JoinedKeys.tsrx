import { state } from '@markless/core';

function Seat({ label }: { readonly label: string }) @{
	let taps = state(0);
	<button onClick={() => (taps = taps + 1)}>{label} {taps}</button>
}

export default function Seats() @{
	let seats = state([
		{ row: 'b', n: 2 },
		{ row: 'b', n: 1 },
	]);
	<main>
		<button onClick={() => (seats = [...seats].reverse())}>Flip</button>
		<button onClick={() => (seats = [{ row: 'a', n: 1 }, ...seats])}>Add</button>
		<ul>
			@for (const seat of seats; key `${seat.row}-${seat.n}`) {
				<li>
					<Seat label={seat.row + seat.n} />
					<button onClick={() => (seats = seats.filter((other) => other.row !== seat.row || other.n !== seat.n))}>Drop</button>
				</li>
			}
		</ul>
	</main>
}
