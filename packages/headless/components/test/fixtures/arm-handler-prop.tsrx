import { state } from '@markless/core';

// A function the caller hands the child, inside a flippable @if arm. The child
// never runs on the flip: its markup is rebuilt from compiled parts, and its
// click is rewired through the bound capture minted for this edge.
function Panel({ label, onPick }) @{
	<span data-panel>
		<b data-label>{label}</b>
		<button data-pick type="button" onClick={() => onPick()}>Pick</button>
	</span>
}

export function App() @{
	let shown = state(false);
	let picks = state(0);

	<section data-testid="arm-handler-prop">
		<button data-toggle type="button" onClick={() => shown = !shown}>Toggle</button>
		<output data-picks>{picks}</output>
		@if (shown) { <Panel label="ready" onPick={() => picks = picks + 1} /> }
	</section>
}
