import { computed, element, shared, state } from '@markless/core';
import { rosterOf } from '../report.ts';

// A widget family carrying BOTH an element() handle and a factory computed over
// one of its own cells - the two halves that pulled in opposite directions: the
// handle is a roster that must not merge across sibling widgets, and the
// computed is a derive chain that dies when no component owns the family's
// nodes.
export const gauge = shared(
	() => {
		const g = state({ label: 'quiet', roster: '' });
		const loud = computed(() => g.label.toUpperCase());
		const marks = element<HTMLButtonElement[]>();

		return { ...g, loud, marks };
	},
	{ scope: 'widget' },
);

// The component that ROOTS the family at render. It is declared beside the
// family, so a page that composes it encloses every adopting part it projects.
export function Panel({ children }) @{
	const g = gauge();

	<div data-panel data-roster={g.roster} data-panel-loud={g.loud}>
		<button
			type="button"
			data-probe
			onClick={() => {
				g.roster = rosterOf(g.marks);
			}}
		>probe</button>
		{children}
	</div>
}

export function PanelMark({ name }) @{
	const g = gauge();

	<button type="button" data-mark data-name={name} data-mark-loud={g.loud} el={g.marks}>{name}</button>
}
