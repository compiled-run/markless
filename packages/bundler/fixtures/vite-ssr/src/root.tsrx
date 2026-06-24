import { state } from '@arcade/core';

export function App() @{
	let count = state(0);

	<section>
		<button data-counter onClick={() => count++}>{count}</button>
		<span>hello</span>
	</section>
}
