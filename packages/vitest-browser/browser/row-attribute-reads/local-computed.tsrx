import { computed, state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

function LocalComputedRows() @{
	let current = state('maia');
	const picked = computed(() => current.toUpperCase());
	<ul data-list="local">
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={picked === item.name.toUpperCase() ? 'true' : 'false'} onClick={() => current = item.name}>{item.label}</li>
		}
	</ul>
}

export default function Page() @{
	<main>
		<LocalComputedRows />
	</main>
}
