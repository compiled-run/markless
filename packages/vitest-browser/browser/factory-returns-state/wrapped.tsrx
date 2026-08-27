import { shared, state } from '@markless/core';

export const wrappedState = shared(
	() => {
		const tones = state({ tone: 'plain', note: 'wrapped' });
		return { ...tones, mark() { tones.tone = 'marked'; } };
	},
	{ scope: 'widget' },
);

export function WrappedRoot({ children }) @{
	const wrapped = wrappedState();

	<div data-wrapped-root data-wrapped-tone={wrapped.tone}>{children}</div>
}

export function WrappedNote() @{
	const wrapped = wrappedState();

	<span data-wrapped-note>{wrapped.note}</span>
}
