import { state } from '@markless/core';

export default function TwoVariables() @{
	let clicks = state(0);
	const drawn = Math.floor(Math.random() * 900) + 100;

	<section>
		<p>A watched variable: {clicks}</p>
		<p>An ordinary number, drawn once while this rendered: {drawn}</p>
		<button onClick={() => clicks++}>Add one to the watched variable</button>
	</section>
}
