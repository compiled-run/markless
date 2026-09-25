import { computed, state } from '@markless/core';
import { loadHeading } from './heading';

function Chip() @{
	let taps = state(0);

	<i data-chip onClick={() => taps = taps + 1}>chip {taps}</i>
}

export function App() @{
	let open = state(false);
	const title = computed(async () => loadHeading(window.location.search));

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@try {
			<h4>{title.heading}</h4>
			@if (open) { <Chip /> }
		} @pending {
			<em>Waiting</em>
		}
	</main>
}
