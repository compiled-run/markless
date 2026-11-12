import { computed } from '@markless/core';
import { FlagTabs } from './tabs.tsrx';

export default function StreamedFlagPage() @{
	const items = computed(async () => {
		await new Promise((settle) => setTimeout(settle, 20));
		return ['x', 'y'];
	});

	<main>
		@try {
			<FlagTabs items={items} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
