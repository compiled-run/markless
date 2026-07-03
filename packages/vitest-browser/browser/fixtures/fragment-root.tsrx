import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<>
		<header>Site</header>
		<button type="button" data-count onClick={() => count++}>{count}</button>
	</>
}
