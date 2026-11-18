import { computed, state } from '@markless/core';
import { fetchAccount } from './fetch-data.ts';

export default function BranchBare() @{
	let tick = state(0);
	const member = computed(async () => await fetchAccount(tick, 2));

	<article>
		@try {
			<>
				<label data-who>{member.name}</label>
				<textarea data-field></textarea>
				@if (member.vip) {
					<b data-badge>gold {member.name}</b>
				}
			</>
		} @pending {
			<span>wait</span>
		}
		<button data-again onClick={() => (tick = tick + 1)}>more</button>
	</article>
}
