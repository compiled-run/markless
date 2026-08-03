import { state } from '@markless/core';
import { LeftCounter } from './LeftCounter.tsrx';
import { RightCounter } from './RightCounter.tsrx';

export function App() @{
	let left = state(0);
	let right = state(10);

	<main data-multi-child>
		<LeftCounter value={left} onIncrement={() => left++} />
		<RightCounter value={right} onIncrement={() => right += 2} />
	</main>
}
