import { state } from '@markless/core';
import { Panel } from './arm-imported-panel.tsrx';

export function App() @{
	let shown = state(false);
	let clicks = state(0);

	<section data-testid="arm-imported-flip">
		<button data-toggle type="button" onClick={() => shown = !shown}>Toggle</button>
		<button data-bump type="button" onClick={() => clicks = clicks + 1}>Bump</button>
		<output data-clicks>{clicks}</output>
		@if (shown) { <Panel label="ready" /> }
	</section>
}
