import { shared, state } from '@markless/core';

export const famState = shared(
	() => {
		const fam = state({ rows: [] as ReadonlyArray<{ id: string; label: string }> });

		return { ...fam };
	},
	{ scope: 'subtree' },
);

export function FamRoot({ children }) @{
	<div data-fam-root>{children}</div>
}
