import { computed, state } from '@markless/core';

// Two @ifs in a child of the page hold one component, one given a changing prop,
// so that component's derive is bound per edge and its ids are spelled from the page.
function Badge({ caption }) @{
	let taps = state(0);
	const text = computed(() => `${caption}:${taps}`);

	<strong data-badge onClick={() => (taps = taps + 1)}>{text}</strong>
}

function Toolbar() @{
	let pinned = state(false);
	let level = state(1);

	<nav>
		<button type="button" data-pin onClick={() => (pinned = !pinned)}>Pin</button>
		<button type="button" data-level onClick={() => (level = level + 1)}>Level</button>
		@if (pinned) { <Badge caption="pinned" /> }
		@if (level > 1) { <Badge caption={`level${level}`} /> }
	</nav>
}

export function App() @{
	<article>
		<Toolbar />
	</article>
}
