import { shared, state } from '@markless/core';

export const badge = shared(
	() => {
		const b = state({ label: '' });
		return b;
	},
	{ scope: 'widget' },
);

export function Badge({ label }: { readonly label: string }) @{
	const b = badge();
	b.label = label;
	<span data-badge>{b.label}</span>
}
