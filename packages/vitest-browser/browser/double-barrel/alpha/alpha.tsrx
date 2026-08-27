import { shared, state } from '@markless/core';

export const alphaState = shared(() => state({ tone: 'plain' }), { scope: 'widget' });

export function AlphaRoot({ children }) @{
	const alpha = alphaState();

	<div data-alpha-root data-alpha-tone={alpha.tone}>{children}</div>
}

export function AlphaLabel({ children }) @{
	<span data-alpha-label>{children}</span>
}
