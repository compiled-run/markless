import { computed, state } from '@markless/core';
import VipBadge from './vip-badge.tsrx';
import { fetchAccount } from './fetch-data.ts';

export default function NestedArmFlip() @{
	let round = state(0);
	let open = state(true);
	let detail = state(false);
	const account = computed(async () => await fetchAccount(round, 1));

	<section>
		<button data-again onClick={() => round++}>again</button>
		<button data-open onClick={() => (open = !open)}>open</button>
		<button data-detail-toggle onClick={() => (detail = !detail)}>detail</button>
		@try {
			<div data-card>
				<h3>{account.name}</h3>
				@if (open) {
					<aside data-open-panel>
						<VipBadge label={account.name} />
						@if (detail) {
							<small data-detail>details {account.name}</small>
						} @else {
							<small data-brief>brief</small>
						}
					</aside>
				}
			</div>
		} @pending {
			<p>loading</p>
		}
	</section>
}
