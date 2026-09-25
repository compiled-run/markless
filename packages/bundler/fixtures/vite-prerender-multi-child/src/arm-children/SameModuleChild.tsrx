import { state } from '@markless/core';

function Chip() @{
	let taps = state(0);

	<i data-chip onClick={() => taps = taps + 1}>chip {taps}</i>
}

export function App() @{
	let open = state(false);

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@if (open) { <Chip /> }
	</main>
}
