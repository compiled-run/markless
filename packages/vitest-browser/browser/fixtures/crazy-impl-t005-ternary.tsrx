import { state } from '@markless/core';

export function App() @{
	let open = state(false);

	<section data-t005-ternary>
		<button type="button" data-t005-toggle onClick={() => open = !open}>Toggle</button>
		<output data-t005-label>{open ? 'Close' : 'Open'}</output>
	</section>
}
