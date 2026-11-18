import { computed } from '@markless/core';
import { FlagTabs } from './tabs.tsrx';

export default function FlagPage() @{
	const items = computed(async () => ['x', 'y']);

	<main>
		@try {
			<FlagTabs items={items} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
