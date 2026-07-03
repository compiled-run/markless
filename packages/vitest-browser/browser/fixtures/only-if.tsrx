import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<main>
		<button type="button" data-toggle onClick={() => open = !open}>Toggle</button>
		@if (open) { <p class="only">Shown</p> }
	</main>
}
