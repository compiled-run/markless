import { state } from '@markless/core';

export function App() @{
	let count = state(0);
	let other = state(10);

	<main data-runtime-actions>
		<button type="button" data-increment onClick={() => count++}>Increment</button>
		<button type="button" data-decrement onClick={() => count--}>Decrement</button>
		<button type="button" data-assign onClick={() => count = 7}>Assign</button>
		<button type="button" data-other onClick={() => other++}>Other</button>
		<button type="button" data-double onClick={() => count = count * 2}>Double</button>
		<output data-count>{count}</output>
		<output data-other-count>{other}</output>
	</main>
}
