import { state } from '@markless/core';
import { progress } from '../../index.ts';

// A live job: the consumer owns the amount and raises it from outside the
// family as work completes.
export default function LiveProgress() @{
	let amount = state(30);

	<section>
		<progress.root value={amount} data-testid="root">
			<progress.label data-testid="label">Progress: {amount}%</progress.label>
			<progress.track data-testid="track"><progress.indicator data-testid="indicator" /></progress.track>
		</progress.root>
		<button type="button" data-testid="advance" onClick={() => { amount = 70; }}>
			Change progress
		</button>
		<output data-testid="amount">{amount}</output>
	</section>
}
