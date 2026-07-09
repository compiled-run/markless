import { state } from '@markless/core';

function SafeSibling() @{
	let taps = state(0);
	<button type="button" data-safe-sibling onClick={() => taps++}>{taps}</button>
}

export function App() @{
	<main>
		<SafeSibling />
	</main>
}
