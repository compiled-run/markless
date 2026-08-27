import { computed, state } from '@markless/core';

// The same child, never inside a branch: its derive refreshes through the
// ordinary sync-computed path.
function Panel({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em class="panel" data-panel onClick={() => hits = hits + 1}>{shout}</em>
}

export function App() @{
	<main>
		<Panel label="plain" />
	</main>
}
