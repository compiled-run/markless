import { computed, state } from '@markless/core';
import VipBadge from './vip-badge.tsrx';
import { fetchAccount } from './fetch-data.ts';

export default function ServedChildSwitch() @{
	let round = state(0);
	let view = state('badge');
	const account = computed(async () => await fetchAccount(round, 0));

	<div>
		<button data-again onClick={() => round++}>again</button>
		<button data-plain-view onClick={() => (view = 'plain')}>plain</button>
		<button data-badge-view onClick={() => (view = 'badge')}>badge</button>
		@try {
			<ul data-panel>
				<li data-head>{account.name}</li>
				<li><input data-field /></li>
				@switch (view) {
					@case 'badge': {
						<li data-slot><VipBadge label={account.name} /></li>
					}
					@default: {
						<li data-slot data-text>{view} {account.name}</li>
					}
				}
			</ul>
		} @pending {
			<p>loading</p>
		}
	</div>
}
