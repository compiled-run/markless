import { computed, state } from '@markless/core';

// The branch lives inside a CHILD component and its test reads that child's own
// prop, true at first render. The arm holds a component that has to run, so the
// branch escalates and the client's first paint has to unroll it.
function Leaf({ label }) @{
	let hits = state(0);
	const shout = computed(() => `${label}-${hits}`);

	<em data-leaf onClick={() => hits = hits + 1}>{shout}</em>
}

function Node({ depth }) @{
	let bumps = state(0);
	const title = computed(() => `node-${depth}-${bumps}`);

	<section data-node>
		<button type="button" data-bump onClick={() => bumps = bumps + 1}>{title}</button>
		<div data-slot>
			@if (depth > 1) { <Leaf label="inner" /> }
		</div>
	</section>
}

export function App() @{
	<main>
		<Node depth={3} />
	</main>
}
