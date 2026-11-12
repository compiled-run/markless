import { computed } from '@markless/core';
import { FormTabs } from './tabs.tsrx';

export default function FormPage() @{
	const items = computed(async () => ['x', 'y']);

	<main>
		@try {
			<FormTabs items={items} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
