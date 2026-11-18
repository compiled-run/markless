import { state } from '@markless/core';

export default function Counter() @{
	let count = state(0);

	<button type="button" class="counter" data-counter data-probe="counter" onClick={() => count++}>
		<style>
			.counter { --counter-mark: counter; color: rgb(44, 55, 66); padding: 4px 10px; }
		</style>
		{`Count ${count}`}
	</button>
}
