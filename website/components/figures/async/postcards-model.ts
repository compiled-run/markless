// The postcard race's values: two cards posted in order, how far each has to travel, and the rule that the latest request wins.
export const CARDS = [
	{ id: 'austin', name: 'Austin', temp: '31°' },
	{ id: 'boston', name: 'Boston', temp: '12°' },
	{ id: 'denver', name: 'Denver', temp: '-3°' },
] as const;
export type CardId = (typeof CARDS)[number]['id'];
export type Spot = 'lane' | 'flying' | 'pinned' | 'void';

/** Where each posted card starts on the lane, in drawing units; Denver is nearer, so it lands first unless the reader moves it. */
export const START = { boston: 90, denver: 280 } as const;
export const LANE = { min: 36, max: 420 } as const;
/** The lane's end, where a card is pinned. */
export const BOARD_X = 498;
/** Milliseconds per drawing unit of travel. */
export const PACE = 6;
export const DROP_MS = 600;

export const travelMs = (x: number) => Math.round((BOARD_X - x) * PACE);
export const seconds = (ms: number) => (ms / 1000).toFixed(1) + ' s';
export const clampLane = (x: number) => Math.max(LANE.min, Math.min(LANE.max, x));

/** The order a card was sent in: Austin was first, before the race; Boston then Denver are posted together. */
export const sentIndex = (id: CardId) => CARDS.findIndex((card) => card.id === id);

/** A landing card is pinned only if nothing sent after it has landed already. */
export const lands = (id: CardId, newestLanded: number) => sentIndex(id) > newestLanded;

export function describeCard(id: CardId, x: number): string {
	const card = CARDS[sentIndex(id)]!;
	if (id === 'austin') return `${card.name}: on the board now`;
	return `${card.name}: sent ${id === 'boston' ? 'first' : 'second'}, ${seconds(travelMs(x))} away`;
}

export function describeRace(pinned: CardId, voided: readonly CardId[]): string {
	const name = (id: CardId) => CARDS[sentIndex(id)]!.name;
	const dropped = voided.map(name).join(' and ');
	return `${name(pinned)} is on the board. ${dropped} ${voided.length === 1 ? 'was' : 'were'} dropped: only the latest request's answer is shown.`;
}
