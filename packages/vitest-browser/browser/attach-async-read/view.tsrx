import { shared, state } from '@markless/core';

export const mapView = shared(
	() => {
		const view = state({ zoom: 4, label: 'fleet' });
		return { view };
	},
	{ scope: 'app' },
);
