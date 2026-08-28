import { shared, state } from '@markless/core';

export const betaState = shared(
	() => {
		const tones = state({ tone: 'plain' });
		return { ...tones, mark() { tones.tone = 'marked'; } };
	},
	{ scope: 'widget' },
);

export function BetaRoot({ children }) @{
	const beta = betaState();

	<div data-beta-root data-beta-tone={beta.tone}>{children}</div>
}

export function BetaLabel({ children }) @{
	<span data-beta-label>{children}</span>
}
