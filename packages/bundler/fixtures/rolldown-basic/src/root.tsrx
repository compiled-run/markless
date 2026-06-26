import { state } from 'arcade';

export function App() @{
	let count = state(0);

	<button onClick={() => count++}>{count}</button>
}
