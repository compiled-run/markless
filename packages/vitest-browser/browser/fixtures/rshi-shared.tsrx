import { element, shared, state } from '@markless/core';
import { markTrack } from './rshi-mark.ts';

// The carousel's own shape, stripped to the part that breaks. A widget-scoped
// record closes over an element() handle and reads it from a METHOD, and the
// part that calls the method binds no handle of its own - so nothing about the
// reading part's own edge path names the rendered widget it stands inside.
export const rshi = shared(
	() => {
		const s = state({ steps: 0 });
		const trackEl = element<HTMLDivElement>();

		return {
			...s,
			trackEl,

			/** Reads the handle from inside the record, not at the calling part. */
			step() {
				s.steps = s.steps + 1;
				markTrack(trackEl, s.steps);
			},
		};
	},
	{ scope: 'widget' },
);

export function RshiRoot({ children }) @{
	const r = rshi();

	<div data-rshi-root data-steps={r.steps}>{children}</div>
}

export function RshiTrack() @{
	const r = rshi();

	<div data-rshi-track el={r.trackEl}>track</div>
}

// Binds no handle, and forwards a consumer callback - which is what makes its
// handler a BOUND symbol, dispatched at the page's own edge path rather than the
// composed path that names the widget root. That is the carousel trigger.
export function RshiTrigger({ onClick, ...rest }) @{
	const r = rshi();

	<button {...rest} type="button" data-rshi-trigger onClick={(event) => {
		r.step();
		onClick?.(event);
	}}>step</button>
}
