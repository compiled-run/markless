import { state } from '@markless/core';

export function App() @{
	let open = state(true);
	let count = state(0);

	<section>
		@if (open) {
			<button type="button" data-inside onClick={() => count++}>{count}</button>
		} @else {
			<p data-closed>closed</p>
		}
		<button type="button" data-toggle onClick={() => (open = !open)}>Toggle</button>
		<output data-count>{count}</output>
	</section>
}
