import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<section data-counter-panel>
		<button data-counter onClick={() => count++}>Count {count}</button>
	</section>
}
