import { state } from '@markless/core';

export default function ArmElementText() @{
	let count = state(0);
	let open = state(false);

	<main>
		<button type="button" data-bump onClick={() => count = count + 1}>bump</button>
		<button type="button" data-flip onClick={() => open = !open}>flip</button>
		<output data-out>
			@if (open) {
				<em data-plain>{count}</em>
			} @else {
				<span data-wrapped>count is {count}</span>
			}
		</output>
	</main>
}
