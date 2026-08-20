import { shared, state } from '@markless/core';

// A second widget family, so a nested projection has two live widget instances
// to resolve between.
export const pnl = shared(() => {
	const p = state({ tone: '' });

	return { ...p };
}, { scope: 'widget' });

export function PanelRoot({ tone, children }) @{
	const p = pnl();
	p.tone = tone ?? '';

	<div data-pnl-root data-tone={p.tone}>{children}</div>
}

export function PanelLabel() @{
	const p = pnl();

	<em data-pnl-label data-tone={p.tone}>l</em>
}
