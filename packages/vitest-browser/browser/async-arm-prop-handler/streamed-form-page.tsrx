import { computed } from '@markless/core';
import { FormTabs } from './tabs.tsrx';

export default function StreamedFormPage() @{
	const items = computed(async () => {
		await new Promise((settle) => setTimeout(settle, 20));
		return ['x', 'y'];
	});

	<main>
		@try {
			<FormTabs items={items} />
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
