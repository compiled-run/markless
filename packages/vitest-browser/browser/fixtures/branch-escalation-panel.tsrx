import { computed, state } from '@markless/core';

// A page-level @if whose arm holds a same-module component that keeps state and
// a computed of its own: the flip cannot rebuild that markup, so it escalates
// to a page re-render and commits the branch range from what came back.
function Panel({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em class="panel" data-panel onClick={() => hits = hits + 1}>{shout}</em>
}

export function App() @{
	let armed = state(false);

	<main>
		<button type="button" data-arm onClick={() => armed = !armed}>Arm</button>
		@if (armed) { <Panel label="ready" /> }
	</main>
}
