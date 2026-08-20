import { state } from '@markless/core';
import { progress } from '../../src/index.ts';

// The consumer owns the amount and changes it from outside the family.
export function App() @{
	let amount = state(30);

	<section data-testid="reactive">
		<div data-case="reactive">
			<progress.root value={amount}>
				<progress.label>Progress: {amount}%</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<button type="button" data-action="change" onClick={() => { amount = 70; }}>
			Change progress
		</button>
		<output data-probe="amount">{amount}</output>
	</section>
}
