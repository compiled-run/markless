import { computed, state } from '@markless/core';

export default function Derived({ items }: { items: Array<number> }) @{
	let extra = state<Array<number>>([]);
	const shown = computed(() => [...items, ...extra]);

	<div>
		<button data-extra onClick={() => (extra = [...extra, 100])}>extra</button>
		<p data-direct>{items.length}</p>
		<p data-derived>{shown.length}</p>
	</div>
}
