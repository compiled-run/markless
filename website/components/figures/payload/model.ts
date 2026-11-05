// The values the gallery-wall figure shows and the sentence its live region speaks.
export const STATE_CARD = ['markless/state', 'bags = 0'] as const;
export const VIEW_CARD = ['markless/view', 'h2 click → symbol:0', 'state:bags → h1'] as const;

export const describeWall = (looking: boolean) =>
	looking
		? 'Beside the finished page hang two plain cards: markless/state, which says bags is 0, and markless/view, which says a click on the button runs symbol:0 and bags shows in the paragraph. That is everything the server added. The plain print with nothing to react to hangs with no cards.'
		: 'A finished cart page hangs on the gallery wall with two cards beside it, and a plain print hangs further along with none.';
