import { shared, state } from '@markless/core';
import { WcbTrigger, WcbRoot } from './wcb.tsrx';

// The RETURN leg of the composed-widget seam. This group composes the wcb root
// and hands it a graph-referenced `on` prop of its own; a write on this instance
// has to reach the composed root's seeded cell, so the part inside it follows the
// group. The part's own toggle still writes that cell directly: last write wins.
export const wsf = shared(
	() => {
		const g = state({ all: false });

		return {
			...g,
			setAll(next: boolean) {
				g.all = next;
			},
		};
	},
	{ scope: 'widget' },
);

export function WsfRoot({ children }) @{
	const g = wsf();

	<div data-wsf-root>
		<button type="button" data-wsf-all onClick={() => g.setAll(true)}>all</button>
		<button type="button" data-wsf-none onClick={() => g.setAll(false)}>none</button>
		<WcbRoot on={g.all}>{children}</WcbRoot>
	</div>
}

export function WsfTrigger() @{
	<WcbTrigger />
}
