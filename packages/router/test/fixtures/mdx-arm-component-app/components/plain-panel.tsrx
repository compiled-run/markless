import { state } from '@markless/core';

// An arm holding only markup and a handler, no component.
export default function PlainPanel() @{
	let open = state(false);
	let hits = state(0);

	<section>
		@if (open) {
			<button class="badge" onClick={() => hits++}>{hits}</button>
		}
		<button data-open onClick={() => (open = !open)}>open</button>
	</section>
}
