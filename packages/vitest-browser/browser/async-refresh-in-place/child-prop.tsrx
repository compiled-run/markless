import { computed, state } from '@markless/core';
import { fetchAccount } from './fetch-data.ts';

function Badge({ label, level }: { label: string; level: number }) @{
	let said = state('');
	<p data-badge title={label}>
		<span data-label>{label}</span>
		<input data-field />
		<small>{level}</small>
		<button data-say onClick={() => (said = label)}>say</button>
		<output>{said}</output>
	</p>
}

export default function ChildProp() @{
	let round = state(0);
	const account = computed(async () => await fetchAccount(round, 99));

	<div>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<section>
				<Badge label={account.name} level={round} />
			</section>
		} @pending {
			<p>loading</p>
		}
	</div>
}
