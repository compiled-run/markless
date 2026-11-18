import { state } from '@markless/core';
import { CURRENCY, PLANS } from '../lib/real-values/plans.ts';
import { dearer, price } from '../lib/real-values/format.ts';

function label(name: string, cents: number): string {
	return `${name} at ${price(cents, CURRENCY)}`;
}

export default function App() @{
	let budget = state(1000);
	let summary = state('');
	<main>
		@for (const plan of PLANS; key plan.id) {
			<p>{label(plan.name, plan.cents)}</p>
		}
		<p>{`Over budget ${dearer(PLANS, budget)}`}</p>
		<p>{summary}</p>
		<button onClick={() => {
			budget = budget * 2;
			summary = `Budget ${price(budget, CURRENCY)}`;
		}}>Double</button>
	</main>
}
