import { state } from '@markless/core';

export function Counter() @{
	let count = state(0);
	const step = 2;
	function add() {
		count = count + step;
	}
	<main>
		<button type="button" data-add onClick={add}>add</button>
		<output>{count}</output>
	</main>
}
