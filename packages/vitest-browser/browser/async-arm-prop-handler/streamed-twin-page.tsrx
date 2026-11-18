import { computed } from '@markless/core';
import { FormTabs } from './tabs.tsrx';

export default function StreamedTwinPage() @{
	const items = computed(async () => {
		await new Promise((settle) => setTimeout(settle, 20));
		return ['x', 'y'];
	});

	<main>
		@try {
			<div>
				<FormTabs items={items} />
				<FormTabs items={items} />
			</div>
		} @pending {
			<p data-loading>loading</p>
		}
	</main>
}
