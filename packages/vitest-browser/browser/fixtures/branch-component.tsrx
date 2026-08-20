import { state } from '@markless/core';

// The components the branches show: markup only, nothing to run.
function Badge() @{
	<em class="badge">Armed</em>
}

function Lamp() @{
	<em class="lamp">Lit</em>
}

export function App() @{
	let armed = state(false);
	let lit = state(true);
	let clicks = state(0);

	<main>
		<button type="button" data-arm onClick={() => { clicks = clicks + 1; armed = !armed; }}>Arm</button>
		<output data-clicks>{clicks}</output>
		@if (armed) { <Badge /> }
		<button type="button" data-dim onClick={() => { clicks = clicks + 1; lit = !lit; }}>Dim</button>
		@if (lit) { <Lamp /> }
	</main>
}
