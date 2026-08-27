import { shared, state } from '@markless/core';

// A `shared()` factory that returns `state(...)` itself leaves this family's
// attribute residue reading an unbound local, so the ratified wrapper-object
// shape is what this witness pins the barrel behaviour on.
export const alphaState = shared(
	() => {
		const tones = state({ tone: 'plain' });
		return { ...tones, mark() { tones.tone = 'marked'; } };
	},
	{ scope: 'widget' },
);

export function AlphaRoot({ children }) @{
	const alpha = alphaState();

	<div data-alpha-root data-alpha-tone={alpha.tone}>{children}</div>
}

export function AlphaLabel({ children }) @{
	<span data-alpha-label>{children}</span>
}
