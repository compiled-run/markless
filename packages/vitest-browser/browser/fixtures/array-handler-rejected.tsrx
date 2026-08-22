import { state } from '@markless/core';

// Deliberately invalid: the array form must fail the build, never render.
export function App() @{
	let count = state(0);

	<button type="button" onClick={[() => count++, () => count--]}>{count}</button>
}
