import { computed } from '@markless/core';
import CountTabs from './count-tabs.tsrx';

export default function StreamedTabsPage() @{
	const items = computed(async () => {
		await new Promise((settle) => setTimeout(settle, 20));
		return ['x', 'y'];
	});

	<main>
		@try {
			<CountTabs items={items} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
