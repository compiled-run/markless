// The Lists filter figure's values: the cards in the drawer, which ones the typed label lets through, and what the live region says.
export const CARDS = [
	{ id: 'dune', title: 'Dune' },
	{ id: 'emma', title: 'Emma' },
	{ id: 'ulysses', title: 'Ulysses' },
	{ id: 'kim', title: 'Kim' },
	{ id: 'beloved', title: 'Beloved' },
	{ id: 'middlemarch', title: 'Middlemarch' },
] as const;
export const MAX_QUERY = 12;
export const STEP_Y = 30;
export const STEP_X = 5;
/** How far a card that doesn't match sinks: far enough that its tab is below the drawer edge. */
export const DROP = 150;

export const matches = (title: string, query: string) => title.toLowerCase().includes(query.trim().toLowerCase());
export const shownOf = (query: string) => CARDS.filter((card) => matches(card.title, query));

/** Where a card stands: its place among the shown cards, front first, or dropped below the drawer edge. */
export function placeOf(query: string, id: string): string {
	const shown = shownOf(query);
	const slot = shown.findIndex((card) => card.id === id);
	if (slot < 0) {
		const at = CARDS.findIndex((card) => card.id === id);
		return `transform: translate(${at * STEP_X}px, ${DROP}px)`;
	}
	return `transform: translate(${slot * STEP_X}px, ${-slot * STEP_Y}px)`;
}

export function describeFilter(query: string): string {
	const shown = shownOf(query);
	if (query.trim() === '') return `No filter: all ${CARDS.length} cards stand in the drawer.`;
	if (shown.length === 0) return `Nothing matches “${query}”. Every card dropped below the edge, so @empty would show.`;
	return `“${query}” keeps ${shown.map((card) => card.title).join(', ')}, in their order; the other ${CARDS.length - shown.length} dropped below the edge.`;
}
