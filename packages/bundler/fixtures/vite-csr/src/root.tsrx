import { state } from '@arcade/core';
import { nextCount } from './counter-flow.ts';

export function App() @{
	let count = state(0);

	<button onClick={() => count = nextCount(count)}>{count}</button>
}
