import { computed, state } from '@markless/core';
import { rowsUpTo } from './api.ts';
import OpenTabs from './open-tabs.tsrx';

export default function OpenCardsPage() @{
	let n = state(3);
	const items = computed(async () => await rowsUpTo(n));

	<main>
		<button data-more onClick={() => n++}>more</button>
		@try {
			<OpenTabs items={items} first="cards" />
		} @pending {
			<p>loading</p>
		}
	</main>
}
