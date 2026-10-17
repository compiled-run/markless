import { shared, state } from '@markless/core';

export const menus = shared(
	() => {
		const cells = state({ open: '', at: '' });
		return { ...cells };
	},
	{ scope: 'page' },
);
