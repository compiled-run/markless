import { computed, state } from '@markless/core';

export default function Derived({ items }: { items: Array<{ id: string; text: string }> }) @{
	let extra = state<Array<{ id: string; text: string }>>([]);
	const shown = computed(() => [...items, ...extra]);

	<ul data-list>
		@for (const item of shown; key item.id) {
			<li>{item.text}</li>
		}
	</ul>
}
