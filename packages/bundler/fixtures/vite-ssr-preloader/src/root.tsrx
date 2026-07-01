import { state } from '@markless/core';
import { nextCount } from './counter-flow.ts';

export function App() @{
	let count = state(0);

	<section>
		<button data-counter onClick={() => count = nextCount(count)}>{count}</button>
		<span>hello</span>
	</section>
}
