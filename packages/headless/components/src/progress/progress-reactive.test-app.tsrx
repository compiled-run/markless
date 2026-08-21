import { state } from '@markless/core';
import { progress } from '../index.ts';

// The consumer owns the amount and changes it from outside the family.
export function App() @{
	let amount = state(30);

	<section data-testid="reactive">
		<div data-testid="reactive-case">
			<progress.root value={amount}>
				<progress.label>Progress: {amount}%</progress.label>
				<progress.track><progress.indicator /></progress.track>
			</progress.root>
		</div>
		<button type="button" data-testid="change" onClick={() => { amount = 70; }}>
			Change progress
		</button>
		<output data-testid="amount">{amount}</output>
	</section>
}
