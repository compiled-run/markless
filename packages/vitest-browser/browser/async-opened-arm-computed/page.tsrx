import { computed, state } from '@markless/core';
import Tabs from './tabs.tsrx';

export default function Page() @{
	let n = state(3);
	const items = computed(async () => Array.from({ length: n }, (_, i) => i));

	<main>
		<button data-more onClick={() => n++}>more</button>
		@try {
			<Tabs items={items} />
		} @pending {
			<p>loading</p>
		}
	</main>
}
