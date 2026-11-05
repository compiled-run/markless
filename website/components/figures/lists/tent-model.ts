// The Lists figure's values: three guests keyed by id, which slot each sits in, and what the live region says.
export const GUESTS = [
	{ id: 'grace', name: 'Grace' },
	{ id: 'linus', name: 'Linus' },
	{ id: 'ada', name: 'Ada' },
] as const;
export type GuestId = (typeof GUESTS)[number]['id'];

export const FIRST: readonly GuestId[] = ['grace', 'linus', 'ada'];
/** A card's width in drawing units, matching tent.ts. */
export const CARD_W = 170;

export const toggle = (ticked: readonly GuestId[], id: GuestId): GuestId[] => (ticked.includes(id) ? ticked.filter((t) => t !== id) : [...ticked, id]);

export const reverse = (order: readonly GuestId[]) => [...order].reverse();

/** Swap the cards in two slots, as a drag from one onto the other does. */
export function swap(order: readonly GuestId[], a: number, b: number): GuestId[] {
	const next = [...order];
	[next[a], next[b]] = [next[b]!, next[a]!];
	return next;
}

export const slotOf = (order: readonly GuestId[], id: GuestId) => order.indexOf(id);
export const nameOf = (id: GuestId) => GUESTS.find((guest) => guest.id === id)!.name;

/** Which slot a pointer at `x` (in drawing units) is over. */
export const slotAt = (x: number, slots: readonly number[], width: number) => slots.reduce((best, left, i) => (Math.abs(left + width / 2 - x) < Math.abs(slots[best]! + width / 2 - x) ? i : best), 0);

export function describeOrder(order: readonly GuestId[], ticked: readonly GuestId[]): string {
	const list = order.map((id) => nameOf(id) + (ticked.includes(id) ? ' (ticked)' : '')).join(', ');
	return `The cards now read ${list}. Each tick moved with its card; the slots stayed put.`;
}
