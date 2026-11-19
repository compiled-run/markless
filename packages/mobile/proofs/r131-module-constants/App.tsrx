import { state } from '@markless/core';
import { CURRENCY, PLANS } from '../lib/real-values/plans.ts';
import copy from '../lib/real-values/copy.json';

const [FIRST] = PLANS;
const { title: TITLE } = copy;

export default function App() @{
	let picked = state(FIRST!.name);
	<main>
		<h1>{TITLE}</h1>
		@for (const plan of PLANS; key plan.id) {
			<button onClick={() => (picked = plan.name)}>{`${plan.name} ${CURRENCY}${plan.cents / 100}`}</button>
		}
		<p>{`${copy.pickedPrefix} ${picked}`}</p>
	</main>
}
