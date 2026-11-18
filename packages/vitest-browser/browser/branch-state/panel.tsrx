import { state } from '@markless/core';

export default function Panel() @{
	let open = state(false);

	<section>
		<button data-toggle onClick={() => (open = !open)}>Toggle</button>
		@if (open) {
			let draft = state(0);

			<button data-draft onClick={() => draft++}>{draft}</button>
		}
	</section>
}
