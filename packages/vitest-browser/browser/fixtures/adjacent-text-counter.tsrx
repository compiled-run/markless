import { state } from '@markless/core';

export default function AdjacentTextCounter() @{
	const noun = 'Presses';
	let presses = state(0);

	<button type="button" data-presses onClick={() => presses++}>{noun} {presses}</button>
}
