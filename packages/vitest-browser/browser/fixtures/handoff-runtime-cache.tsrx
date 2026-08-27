import { computed, state } from '@markless/core';

// Same module as the page it serves: a branch arm holding a component from
// another file is MARKLESS_BRANCH_ARM_UPDATE_UNSUPPORTED.
function Panel({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em data-panel onClick={() => hits = hits + 1}>{shout}</em>
}

// An escalating branch over a stateful component, plus a page-level counter.
// Both climb across repeated events only while one runtime answers them all.
export function App() @{
	let armed = state(false);
	let taps = state(0);

	<main>
		<button type="button" data-arm onClick={() => armed = !armed}>Arm</button>
		<button type="button" data-tap onClick={() => taps = taps + 1}>Tap</button>
		<output data-taps>{taps}</output>
		@if (armed) { <Panel label="ready" /> }
	</main>
}
