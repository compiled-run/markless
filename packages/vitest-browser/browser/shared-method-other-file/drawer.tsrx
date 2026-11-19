import { shared, state } from '@markless/core';

export const drawer = shared(
	() => {
		const panel = state({ expanded: false, label: 'shut' });
		return {
			...panel,
			flip() {
				const now = panel.expanded;
				panel.expanded = !now;
			},
			name(text: string) {
				panel.label = text;
			},
		};
	},
	{ scope: 'app' },
);
