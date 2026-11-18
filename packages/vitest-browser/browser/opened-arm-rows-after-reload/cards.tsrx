import { computed } from '@markless/core';
import Card from './card.tsrx';

export default function Cards({ items }: { items: Array<{ id: string; text: string }> }) @{
	const sorted = computed(() => items.toSorted((a, b) => a.id.localeCompare(b.id)));

	<ul data-list>
		@for (const item of sorted; key item.id) {
			<Card text={item.text} />
		}
	</ul>
}
