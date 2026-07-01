import { state } from '@markless/core';

export function App() @{
	let count = state(0);

	<button type="button" data-counter onClick={() => count++}>{count}</button>
}
