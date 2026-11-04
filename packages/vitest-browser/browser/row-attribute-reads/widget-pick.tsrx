import { shared, state } from '@markless/core';

export const pick = shared(
	() => {
		const chosen = state({ name: 'maia' });
		return chosen;
	},
	{ scope: 'widget' },
);

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export function PickList() @{
	const chosen = pick();
	<ul data-widget>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={chosen.name === item.name ? 'true' : 'false'} onClick={() => chosen.name = item.name}>{item.label}</li>
		}
	</ul>
}
