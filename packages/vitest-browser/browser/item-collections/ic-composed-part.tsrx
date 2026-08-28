import { computed, element, shared, state } from '@markless/core';
import { ic } from './ic-widget.tsrx';

// The part and the component that COMPOSES it live in one module, which is the
// shape every real family writes: `tour.item` is a wrapper whose own template
// puts the consumer's children inside the card that stands in the roster. It
// matters because a shared-seed pass walks a composing link by evaluating its
// module's initial values, and the producer hands every component of a module
// the whole module's list - so the card's position derive runs at seed time,
// once per composing link, with no card rendered.

/** One instance per card, so the wrapper roots a widget the way `tour.item` does. */
export const icCard = shared(
	() => {
		const card = state({ note: '' });
		const noteEl = element<HTMLSpanElement>();

		return { ...card, noteEl };
	},
	{ scope: 'widget' },
);

export function IcComposedPart({ children }) @{
	const card = icCard();
	card.note = 'card';

	<IcCard>{children}</IcCard>
}

function IcCard({ children }) @{
	const w = ic();
	const mine = element<HTMLDivElement>();
	const pos = computed(() => w.itemEls.indexOf(mine as HTMLDivElement));
	const char = computed(() => w.code?.slice(pos, pos + 1) ?? '');

	<div data-ic-item el={[w.itemEls, mine]} ui-pos={pos} ui-mine={char}>{children}</div>
}
