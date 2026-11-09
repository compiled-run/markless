import { computed, state } from '@markless/core';
import VipBadge from './vip-badge.tsrx';
import { fetchAccount } from './fetch-data.ts';

export default function ImportedChildFlip() @{
	let round = state(0);
	const account = computed(async () => await fetchAccount(round, 2));

	<section>
		<button data-again onClick={() => round++}>again</button>
		@try {
			<div data-card>
				<h3>{account.name}</h3>
				<input data-field />
				@if (account.vip) {
					<VipBadge label={account.name} />
				} @else {
					<em data-plain>regular {account.name}</em>
				}
			</div>
		} @pending {
			<p>loading</p>
		}
	</section>
}
