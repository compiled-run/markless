import { state } from 'arcade';

export function App() @{
	let count = state(0);

	<button data-counter onClick={() => count++}>{count}</button>
}
