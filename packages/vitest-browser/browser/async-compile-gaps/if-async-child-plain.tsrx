import { computed, state } from '@markless/core';

// The bare shape: the arm is only the child, its async value reads a constant prop.
function Greeting({ who }: { who: string }) @{
	const line = computed(async () => {
		await new Promise((resolve) => setTimeout(resolve, 5));
		return `hello ${who}`;
	});

	<p data-greeting>
		@try { <b data-line>{line}</b> } @pending { <i>wait</i> }
	</p>
}

export function App() @{
	let shown = state(false);

	<section>
		<button type="button" data-toggle onClick={() => (shown = !shown)}>Toggle</button>
		@if (shown) { <Greeting who="sam" /> }
	</section>
}
