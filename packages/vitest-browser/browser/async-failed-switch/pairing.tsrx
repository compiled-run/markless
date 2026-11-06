import { computed, state } from '@markless/core';
import { getCount } from './gate.ts';

export default function Pairing() @{
	let round = state(0);
	const total = computed(async () => await getCount(round));
	const share = computed(() => `${round}: ${total}`);

	<p>
		@try {
			<span data-share>{share}</span>
		} @pending {
			<span>wait</span>
		}
	</p>
}
