import { shared, state } from '@markless/core';

// The ruled authoring shape for widget config: the part signature carries the
// defaults, and the body assigns unconditionally. The factory's own initials are
// placeholders nothing should ever render, so a rendered "placeholder" or -1
// means a seed was skipped.
export const sd = shared(
	() => {
		const cell = state({ tone: 'placeholder', level: -1 });
		return { ...cell, bump() { cell.level = cell.level + 1; } };
	},
	{ scope: 'widget' },
);

export function Root({ tone = 'quiet', level = 0, children }) @{
	const cell = sd();
	cell.tone = tone;
	cell.level = level;

	<div data-sd-root data-tone={cell.tone}>{children}</div>
}

export function Readout() @{
	const cell = sd();

	<button type="button" data-sd-readout data-level={cell.level} onClick={() => cell.bump()}
	>{cell.tone}</button>
}
