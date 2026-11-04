import type { Children } from '@markless/core';
import { shared, state } from '@markless/core';

export const deck = shared(
	() => {
		const face = state({ name: 'maia' });
		return face;
	},
	{ scope: 'widget' },
);

const ITEMS = [
	{ name: 'lyra', label: 'Lyra' },
	{ name: 'maia', label: 'Maia' },
	{ name: 'nova', label: 'Nova' },
];

export function DeckRoot({ children }: { readonly children: Children }) @{
	const face = deck();
	<div data-deck data-face={face.name}>{children}</div>
}

export function DeckCards() @{
	const face = deck();
	<ul>
		@for (const item of ITEMS; key item.name) {
			<li data-item={item.name} data-checked={face.name === item.name ? 'true' : 'false'} onClick={() => face.name = item.name}>{item.label}</li>
		}
	</ul>
}
