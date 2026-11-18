import { computed, state } from '@markless/core';
import { loadHeading } from './heading';

function Badge() @{
	let presses = state(0);

	<b data-chip onClick={() => presses = presses + 1}>chip {presses}</b>
}

export function App() @{
	let shown = state(false);
	let round = state(0);
	const title = computed(async () => loadHeading(`#${round}`));

	<main data-multi-child>
		<button type="button" data-open onClick={() => shown = !shown}>Open</button>
		<button type="button" data-again onClick={() => round = round + 1}>Again</button>
		@try {
			<section>
				@if (shown) { <Badge /> }
				<h4>{title.heading}</h4>
			</section>
		} @pending {
			<em>Waiting</em>
		}
	</main>
}
