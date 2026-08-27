import { computed, state } from '@markless/core';

// Two branches over the same component: each flip must bring in its own
// instance, so bumping one leaves the other where it was.
function Panel({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em class="panel" data-panel onClick={() => hits = hits + 1}>{shout}</em>
}

export function App() @{
	let left = state(false);
	let right = state(false);

	<main>
		<button type="button" data-left onClick={() => left = !left}>Left</button>
		<button type="button" data-right onClick={() => right = !right}>Right</button>
		@if (left) { <span data-slot-left><Panel label="left" /></span> }
		@if (right) { <span data-slot-right><Panel label="right" /></span> }
	</main>
}
