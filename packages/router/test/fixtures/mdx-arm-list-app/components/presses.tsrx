import { state } from '@markless/core';

export default function Presses() @{
	let open = state(false);

	<section class="presses">
		<button data-open onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			let presses = state(0);

			<button data-press onClick={() => presses++}>{presses}</button>
		}
	</section>
}
