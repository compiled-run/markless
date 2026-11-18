import { state } from '@markless/core';
import { PLANS } from '../lib/real-values/plans.ts';
import { Badge } from '../lib/real-values/Badge.tsrx';

const NOTE = 'plan';

export default function App() @{
	let picks = state(0);
	const each = 'x';
	<main>
		@for (const plan of PLANS; key plan.id) {
			<Badge label={plan.name} note={NOTE} count={picks} />
		}
		<Badge label={each} note={NOTE} count={picks} />
		<button onClick={() => picks++}>Pick</button>
	</main>
}
