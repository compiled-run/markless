export interface Entry { readonly id: number; readonly label: string; readonly on: boolean }

export const FLAT: readonly Entry[] = [
	{ id: 1, label: 'A1', on: true },
	{ id: 2, label: 'A2', on: false },
];

const nextId = (items: readonly Entry[]) => Math.max(0, ...items.map((item) => item.id)) + 1;

// Every write hands back new item objects, as a store that re-derives its view does.
export const flatOps: Record<string, (items: readonly Entry[]) => readonly Entry[]> = {
	'prepend-item': (items) => [{ id: nextId(items), label: 'N' + nextId(items), on: true }, ...items].map((item) => ({ ...item })),
	flip: (items) => items.map((item, at) => ({ ...item, on: at === 0 ? !item.on : item.on })),
	relabel: (items) => items.map((item) => ({ ...item, label: item.label + 'x' })),
	'reverse-items': (items) => [...items].reverse().map((item) => ({ ...item })),
	'remove-item': (items) => items.slice(1).map((item) => ({ ...item })),
};
