import { shared, state } from '@markless/core';

// The COMPOSED family. `PanelRoot` seeds it, so every root a bar item composes
// around its own control roots one rendered panel, and the surface the consumer
// writes inside that item is projected through it.
export const panelState = shared(
	() => {
		const panel = state({ opens: 0, openedBy: '' });

		return { ...panel };
	},
	{ scope: 'widget' },
);

export function PanelRoot({ children }) @{
	const panel = panelState();

	<div data-panel-root data-opens={panel.opens} data-opened-by={panel.openedBy}>{children}</div>
}

// Written by the consumer as a child of the bar item and projected THROUGH the
// composed root, so it reads the panel instance that item composed.
export function PanelSurface({ children }) @{
	const panel = panelState();

	<div data-panel-surface data-opens={panel.opens} data-opened-by={panel.openedBy}>{children}</div>
}
