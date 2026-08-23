import { element, shared, state } from '@markless/core';

// Two instances of this widget stand on one page. Every handler here must reach
// ITS OWN instance's element, not whichever registration landed last.
export const hi = shared(
	() => {
		const s = state({ hits: 0 });
		const panelEl = element<HTMLDivElement>();

		return { ...s, panelEl };
	},
	{ scope: 'widget' },
);

export function HiRoot({ children }) @{
	const s = hi();

	<div data-hi-root data-hits={s.hits}>{children}</div>
}

export function HiPanel() @{
	const s = hi();

	<div data-hi-panel el={s.panelEl}>panel</div>
}

export function HiTrigger() @{
	const s = hi();

	<button type="button" data-hi-trigger onClick={() => {
		s.hits = s.hits + 1;
		s.panelEl.setAttribute('data-hi-hit', 'yes');
	}}>poke</button>
}
