import { shared, state } from '@markless/core';

// The checkbox shape, cut down: the part that writes and the part that branches
// are different components, and the arm holds the branching part's own children.
export const gate = shared(
	() => {
		const g = state({ open: false });
		return {
			...g,
			toggle() {
				g.open = g.open !== true;
			},
		};
	},
	{ scope: 'widget' },
);

export function Root({ children }) @{
	const g = gate();
	<div data-gate>{children}</div>
}

export function Trigger() @{
	const g = gate();
	<button type="button" data-gate-trigger data-raw={g.open} onClick={() => g.toggle()}>go</button>
}

export function Arm({ children }) @{
	const g = gate();
	<span data-gate-arm>@if (g.open) { <>{children}</> }</span>
}
