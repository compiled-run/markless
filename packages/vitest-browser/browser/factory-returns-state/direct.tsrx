import { shared, state } from '@markless/core';

export const directState = shared(
	() => {
		const tones = state({ tone: 'plain', note: 'direct' });
		return tones;
	},
	{ scope: 'widget' },
);

export function DirectRoot({ children }) @{
	const direct = directState();

	<div data-direct-root data-direct-tone={direct.tone}>{children}</div>
}

export function DirectNote() @{
	const direct = directState();

	<span data-direct-note>{direct.note}</span>
}
