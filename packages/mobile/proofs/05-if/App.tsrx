import { state } from '@markless/core';

export default function App() @{
	let open = state(false);
	<main>
		<h1>Details</h1>
		<button onClick={() => (open = !open)}>{open ? 'Hide details' : 'Show details'}</button>
		@if (open) {
			<p>The details are here</p>
		} @else {
			<p>Nothing shown yet</p>
		}
	</main>
}
