import { state } from '@markless/core';

export function App() @{
	let taps = state(0);
	<main>
		<button type="button" data-page-button onClick={() => taps++}>{taps}</button>
	</main>
}
