import { computed, state } from '@markless/core';

// A self-composing component whose @if is true at first render: the arm holds
// another instance of the same component, so the branch escalates, and the arm
// has to paint its content at first paint the way SSR's render does.
function Node({ depth }) @{
	let hits = state(0);
	const label = computed(() => `depth-${depth}-${hits}`);

	<section data-node={String(depth)}>
		<em data-label onClick={() => hits = hits + 1}>{label}</em>
		<div data-slot>
			@if (depth > 1) { <Node depth={depth - 1} /> }
		</div>
	</section>
}

export function App() @{
	<main>
		<Node depth={3} />
	</main>
}
