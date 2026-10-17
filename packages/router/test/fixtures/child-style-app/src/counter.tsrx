import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<button type="button" class="counter" data-counter onClick={() => count++}>
		<style>
			.counter { color: rgb(44, 55, 66); }
		</style>
		{count}
	</button>
}
