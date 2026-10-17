import { shared, state } from '@markless/core';

export const panels = shared(
	() => {
		const cells = state({ open: '', at: '' });
		return { ...cells };
	},
	{ scope: 'page' },
);
