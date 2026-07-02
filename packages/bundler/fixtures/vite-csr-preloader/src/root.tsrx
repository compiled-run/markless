import { state } from '@markless/core';
import { nextCount } from './counter-flow.ts';

export function App() @{
	let count = state(0);

	<button type="button" data-counter onClick={() => count = nextCount(count)}>{count}</button>
}
