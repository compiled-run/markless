import { element, shared, state } from '@markless/core';

export const toolbarState = shared(
	() => {
		const toolbar = state({ active: 0 });
		const itemEls = element<HTMLElement[]>();

		return { ...toolbar, itemEls };
	},
	{ scope: 'widget' },
);
