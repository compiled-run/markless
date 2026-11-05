// The values the restaurant-pass figure shows and the sentence its live region speaks.
export const TUBS = ['Add to cart', 'Gift note', 'Size guide'] as const;
export const ORDERED = TUBS[0];

export const describePass = (ordered: boolean) =>
	ordered
		? `An order came in for ${ORDERED}. Only that tub was opened and cooked; it had arrived with the page. The ${TUBS[1]} and ${TUBS[2]} tubs arrived too, and stay sealed until someone orders them.`
		: `Three prep tubs, ${TUBS.join(', ')}, arrived with the page and stand sealed on the pass. Nothing is cooking.`;
