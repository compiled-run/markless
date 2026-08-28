import { shared, state } from '@markless/core';

export const famState = shared(
	() => {
		const fam = state({ rows: [] as ReadonlyArray<{ id: string; label: string }> });

		return { ...fam };
	},
	{ scope: 'widget' },
);

export function FamRoot({ children }) @{
	<div data-fam-root>{children}</div>
}
