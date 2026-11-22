import { state } from '@markless/core';

export default function IfArm() @{
	let open = state(false);

	<section>
		<button data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			let presses = state(0);

			<button data-count onClick={() => presses++}>{presses}</button>
		}
	</section>
}
