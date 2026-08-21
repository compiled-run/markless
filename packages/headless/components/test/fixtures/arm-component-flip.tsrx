import { state } from '@markless/core';

// A component with props inside a flippable @if arm. The arm's test is page
// state, so a gesture flips it at runtime.
function Panel({ label, count }) @{
	<span data-panel><b data-label>{label}</b><em data-count>{count}</em></span>
}

export function App() @{
	let shown = state(false);
	let clicks = state(0);

	<section data-testid="arm-component-flip">
		<button data-toggle type="button" onClick={() => shown = !shown}>Toggle</button>
		<button data-bump type="button" onClick={() => clicks = clicks + 1}>Bump</button>
		<output data-clicks>{clicks}</output>
		@if (shown) { <Panel label="ready" count={clicks} /> }
	</section>
}
