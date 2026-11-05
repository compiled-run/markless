// The Lists figure's values: three guests, the order they sit in, and the sentence its live region speaks.
export const SHOP = 'Beanshop';

export const GUESTS = [
	{ id: 'grace', name: 'Grace', coffee: true },
	{ id: 'linus', name: 'Linus', coffee: false },
	{ id: 'ada', name: 'Ada', coffee: true },
] as const;
export type GuestId = (typeof GUESTS)[number]['id'];

export const FIRST: readonly GuestId[] = ['grace', 'linus', 'ada'];
export const SORTED: readonly GuestId[] = ['ada', 'grace', 'linus'];
export const flip = (beat: string) => (beat === 'odd' ? 'even' : 'odd');
export const SEATS_TOUR = ['sort', 'rest', 'sort', 'rest'] as const;

export const nextOrder = (order: readonly GuestId[]) => (order[0] === SORTED[0] ? FIRST : SORTED);
export const seatOf = (order: readonly GuestId[], id: GuestId) => order.indexOf(id);
export const nameOf = (id: GuestId) => GUESTS.find((guest) => guest.id === id)!.name;

export function describeSeats(order: readonly GuestId[], moved: boolean): string {
	const list = order.map(nameOf).join(', ');
	return moved ? `The rows moved into a new order: ${list}. Each card took its own tick with it, and no row was built again.` : `The list reads ${list}. Grace and Ada have coffee ticked.`;
}
