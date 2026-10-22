import { state } from '@markless/core';

export function Bags() @{
	let bags = state(1);
	const price = 3;
	<main>
		<button type="button" onClick={() => bags++}>more</button>
		<output>{bags * price}</output>
	</main>
}
