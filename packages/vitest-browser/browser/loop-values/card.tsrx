import { state } from '@markless/core';

export default function Card() @{
	let presses = state(0);

	<p data-testid="card">
		default card
		<button data-testid="card-press" onClick={() => { presses += 1; }}>{presses}</button>
	</p>
}

export function Badge() @{
	<span data-testid="badge">named badge</span>
}
