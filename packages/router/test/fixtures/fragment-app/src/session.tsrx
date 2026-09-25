import { shared, state } from '@markless/core';

export const session = shared(
	() => {
		const visit = state({ hits: 0 });
		return { ...visit };
	},
	{ scope: 'page' },
);
