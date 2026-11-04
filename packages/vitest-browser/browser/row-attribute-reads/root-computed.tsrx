import { computed, state } from '@markless/core';

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export default function Page() @{
	let current = state('maia');
	const picked = computed(() => current);
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={picked === item.name ? 'true' : 'false'} onClick={() => current = item.name}>{item.label}</li>
		}
	</ul>
}
