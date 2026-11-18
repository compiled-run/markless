import { computed, state } from '@markless/core';
import { rowsUpTo } from './api.ts';
import DeepTabs from './deep-tabs.tsrx';

export default function DeepPage() @{
	let n = state(3);
	const items = computed(async () => await rowsUpTo(n));

	<main>
		<button data-more onClick={() => n++}>more</button>
		@try {
			<DeepTabs items={items} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
