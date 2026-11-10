import { computed, state } from '@markless/core';
import { getCount } from './gate.ts';
import UnreadBadge from './unread-badge.tsrx';

export default function UnreadPage() @{
	let round = state(0);
	const unread = computed(async () => await getCount(round));

	<main>
		@try {
			<p>Inbox <UnreadBadge count={unread} /></p>
		} @pending {
			<p data-unread-loading>wait</p>
		}
		<button data-refresh onClick={() => round++}>Check for mail</button>
	</main>
}
