import { state } from '@markless/core';

export function App() @{
	let open = state(true);

	<main>
		<button data-toggle onClick={() => open = !open}>Toggle</button>
		@if (open) { <p class="on">Shown</p> } @else { <p class="off">Hidden</p> }
	</main>
}
