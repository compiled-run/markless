import { computed, state } from '@markless/core';
import { loadHeading } from './heading.ts';

function Chip() @{
	let taps = state(0);
	let steps = state(0);

	<p>
		<i data-chip onClick={() => (taps = taps + 1)}>chip {taps}</i>
		<b data-step onClick={() => (steps += 1)}>step {steps}</b>
	</p>
}

export default function CounterPage() @{
	let open = state(false);
	const title = computed(async () => await loadHeading());

	<main>
		<button type="button" data-open onClick={() => (open = !open)}>Open</button>
		@try {
			<>
				<h4>{title}</h4>
				@if (open) {
					<Chip />
				}
			</>
		} @pending {
			<em>Waiting</em>
		}
	</main>
}
