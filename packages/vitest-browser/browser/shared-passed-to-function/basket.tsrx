import { shared, state } from '@markless/core';

export const basket = shared(
	() => {
		const contents = state({ count: 0, note: 'empty' });
		return { ...contents };
	},
	{ scope: 'app' },
);
