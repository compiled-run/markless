import { shared, state } from '@markless/core';

export const betaState = shared(() => state({ tone: 'plain' }), { scope: 'widget' });

export function BetaRoot({ children }) @{
	const beta = betaState();

	<div data-beta-root data-beta-tone={beta.tone}>{children}</div>
}

export function BetaLabel({ children }) @{
	<span data-beta-label>{children}</span>
}
