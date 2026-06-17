import { state } from '@arcadejs/core';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
