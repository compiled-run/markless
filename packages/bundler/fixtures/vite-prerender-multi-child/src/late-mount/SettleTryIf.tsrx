import { computed, state } from '@markless/core';
import { loadHeading } from './summary';

export function App() @{
	let open = state(false);
	let taps = state(0);
	let holds = state(0);
	const title = computed(async () => loadHeading(window.location.search));
	const detail = computed(async () => loadHeading(window.location.hash));

	<main data-multi-child>
		<button type="button" data-open onClick={() => open = !open}>Open</button>
		@try {
			<h4>{title.heading}</h4>
		} @pending {
			<em>Waiting</em>
		}
		@try {
			<h5>{detail.heading}</h5>
			@if (open) { <i data-chip onClick={() => taps = taps + 1} onDblClick={() => holds = holds + 1}>chip {taps}/{holds}</i> }
		} @pending {
			<em>Waiting</em>
		}
	</main>
}
