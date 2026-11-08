import { shared, state } from '@markless/core';

export const selection = shared(() => {
	const picked = state({ name: 'maia' });
	return picked;
});
