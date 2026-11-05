// The values the round-book figure shows, its tour and the sentence its live region speaks.
export const PRICE = 14;
export const START_BAGS = 2;

export const totalFor = (bags: number) => bags * PRICE;

/** The three spots on the cart page, as houses on the street; only the first two are on a round. */
export const HOUSES = [
	{ key: 'bags', round: true },
	{ key: 'total', round: true },
	{ key: 'product', round: false },
] as const;

export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const ROUND_TOUR = ['print', 'rest', 'print', 'rest', 'reset'] as const;

export const describeRound = (bags: number, printed: boolean) =>
	printed
		? `A new edition, bags = ${bags}, was printed. Papers went to the two houses on its rounds: In your cart now reads ${bags} bags and Total reads $${totalFor(bags)}. House blend is on no round and got nothing.`
		: `The round book lists who reads state:bags. The street shows In your cart: ${bags} bags, Total: $${totalFor(bags)}, and House blend.`;
