// The Lists page's shopping-list demo: its rows, the reorders, and the sentence read out after each.
export type Item = { readonly id: string; readonly n: number; readonly name: string; done: boolean };

export const START: readonly Item[] = [
	{ id: 'pears', n: 1, name: 'Pears', done: false },
	{ id: 'coffee', n: 2, name: 'Coffee', done: false },
	{ id: 'milk', n: 3, name: 'Milk', done: false },
];

export const sortByName = (items: readonly Item[]): Item[] => [...items].sort((a, b) => a.name.localeCompare(b.name));

export const reverse = (items: readonly Item[]): Item[] => [...items].reverse();

/** How many rows sit somewhere new after a reorder. */
export const movedBy = (before: readonly Item[], after: readonly Item[]): number =>
	after.filter((item, at) => before[at]?.id !== item.id).length;

export const rowsWord = (count: number): string => (count === 1 ? '1 row' : count + ' rows');

/** The sentence a screen reader hears after a reorder. */
export const describeOrder = (items: readonly Item[]): string =>
	'The list now reads ' + items.map((item) => item.name + (item.done ? ', ticked' : '')).join('; ') + '. No row was built again.';
