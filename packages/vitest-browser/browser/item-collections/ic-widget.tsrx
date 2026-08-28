import { computed, element, shared, state } from '@markless/core';
import { orderedRoster, readPositions } from './ic-order.ts';

// A widget family reduced to the one thing under test: a root and a repeated
// part whose position is the family's own business. No part takes an index
// prop - the item asks the family's roster where it stands, and `survey()`
// walks the same roster from a handler so the two readings can be compared.
export const ic = shared(
	() => {
		const s = state({ seen: 'unread', count: 0 });
		const itemEls = element<HTMLDivElement[]>();

		return {
			...s,
			itemEls,
			/** Report what the roster holds, in this instance's document order. */
			survey() {
				const bound = itemEls;
				const roster = orderedRoster(bound);
				s.seen = readPositions(roster);
				s.count = roster.length;
			},
		};
	},
	{ scope: 'widget' },
);

export function IcRoot({ children }) @{
	const w = ic();
	// The count the family owes its own markup: nobody authors it, and the root
	// asks for it before a single item has rendered.
	const total = computed(() => w.itemEls.length);

	<div
		data-ic-root
		ui-max={total}
		ui-count={w.count}
		ui-seen={w.seen}
		onClick={() => {
			w.survey();
		}}
	>{children}<span data-ic-total>{total}</span></div>
}

export function IcItem({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));

	<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos}>{children}</div>
}
