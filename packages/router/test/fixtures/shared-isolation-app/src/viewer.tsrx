import { shared, state } from '@markless/core';

export const viewer = shared(
	() => {
		const v = state({ name: 'nobody' });
		return { ...v };
	},
	{ scope: 'app' },
);
