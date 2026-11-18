import { shared, state } from '@markless/core';

export const ui = shared(
	() => {
		const box = state({ open: false, count: 0 });
		return { ...box };
	},
	{ scope: 'app' },
);
