import { state } from '@markless/core';

export default function ServedCounter() @{
	let count = state(0);

	<section>
		<button data-testid="bump" onClick={() => count++}>Bump</button>
		<output data-testid="count">{count}</output>
	</section>
}
