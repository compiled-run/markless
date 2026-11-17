import { state } from '@markless/core';

export function Tally() @{
	let left = state(10);

	<div>
		<h3>Seats left</h3>
		<p>{left} of 10 open</p>
		<button onClick={() => left--}>Take a seat</button>
	</div>
}
