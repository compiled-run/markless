import { state } from '@markless/core';

export function App() @{
	let open = state(false);
	let taps = state(0);

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		<button type="button" data-tap onClick={() => taps = taps + 1}>Tap</button>
		@if (open) { <i data-chip>{`chip ${taps}`}</i> }
	</main>
}
