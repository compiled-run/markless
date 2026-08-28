import { element, shared, state } from '@markless/core';
import { orderedRoster, stampPositions } from './ic-order.ts';

// A widget family reduced to the one thing under test: a root and a repeated
// part whose position is the family's own business. No part takes an index prop,
// and `survey()` is a handler because a handler is the only place an element()
// roster can be read - which is exactly the gap the suite beside this pins.
export const ic = shared(
	() => {
		const s = state({ seen: 'unread', count: 0 });
		const itemEls = element<HTMLDivElement[]>();

		return {
			...s,
			itemEls,
			/** Walk the roster and stamp every item with its place in this instance. */
			survey() {
				const bound = itemEls;
				const roster = orderedRoster(bound);
				s.seen = stampPositions(roster);
				s.count = roster.length;
			},
		};
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
	const w = ic();

	<div
		data-ic-root
		ui-count={w.count}
		ui-seen={w.seen}
		onClick={() => {
			w.survey();
		}}
	>{children}</div>
}

export function IcItem({ children }) @{
	const w = ic();

	<div data-ic-item el={w.itemEls}>{children}</div>
}
