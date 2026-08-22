import { shared, state } from '@markless/core';
import { WcbLabel, WcbRoot, WcbTrigger } from './wcb.tsrx';

// A second family whose root COMPOSES the wcb root and answers its callback slot
// with the group's own logic. The part a consumer writes inside `<GrpRoot>` is
// placed by composition inside that composed wcb root, so its dispatch has to
// leave the wcb widget and reach this module's handler, on this group instance.
export const grp = shared(
	() => {
		const g = state({ name: '', count: 0, last: 'none' });

		return {
			...g,
			record(next: boolean) {
				g.count = g.count + 1;
				g.last = next === true ? 'on' : 'off';
			},
		};
	},
	{ scope: 'widget' },
);

export function GrpRoot({ name, children }) @{
	const g = grp();
	g.name = name;

	<WcbRoot
		label={g.name}
		onChange={(next: boolean) => {
			g.record(next);
		}}
	>{children}</WcbRoot>
}

export function GrpTrigger() @{
	<WcbTrigger />
}

export function GrpLabel({ children }) @{
	<WcbLabel>{children}</WcbLabel>
}

export function GrpCount() @{
	const g = grp();

	<output data-grp-count>{g.count}</output>
}

export function GrpLast() @{
	const g = grp();

	<output data-grp-last>{g.last}</output>
}
