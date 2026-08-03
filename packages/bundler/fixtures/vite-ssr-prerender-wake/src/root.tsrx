import { state } from '@markless/core';
import { WakeChild } from './child.tsrx';

export function WakePage() @{
	let count = state(0);

	<main data-wake-page>
		<WakeChild label="linked child" />
		<button onClick={() => count++}>{count}</button>
		@if (count > 0) { <p data-wake-active>counting</p> } @else { <p data-wake-idle>idle</p> }
	</main>
}
