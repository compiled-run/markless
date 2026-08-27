import { computed, state } from '@markless/core';

// Same shape, open at first render: the served arm is already in the DOM, so
// its records register the way a served boundary arm's do — including the very
// first click inside the arm.
function Panel({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em class="panel" data-panel onClick={() => hits = hits + 1}>{shout}</em>
}

export function App() @{
	let armed = state(true);

	<main>
		<button type="button" data-arm onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Panel label="open" /> }
	</main>
}
