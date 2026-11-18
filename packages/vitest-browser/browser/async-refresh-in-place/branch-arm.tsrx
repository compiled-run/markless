import { computed, state } from '@markless/core';
import { fetchAccount } from './fetch-data.ts';

export default function BranchArm() @{
	let round = state(0);
	const account = computed(async () => await fetchAccount(round, 2));

	<section>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<div data-card>
				<h3>{account.name}</h3>
				<input data-field />
				@if (account.vip) {
					<strong data-badge>vip {account.name}</strong>
				} @else {
					<em data-plain>regular {account.name}</em>
				}
			</div>
		} @pending {
			<p>loading</p>
		}
	</section>
}
