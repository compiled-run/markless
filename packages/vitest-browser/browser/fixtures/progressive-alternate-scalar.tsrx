import { state } from '@markless/core';

export function App() @{
	let tally = state(4);

	<main>
		<input data-anything="yes" onKeyDown={() => tally++} />
		<output data-alternate-total>Total: {tally}</output>
	</main>
}
