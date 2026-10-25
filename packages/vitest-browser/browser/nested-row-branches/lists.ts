export interface Entry { readonly id: number; readonly label: string; readonly on: boolean }
export interface List { readonly key: string; readonly items: readonly Entry[] }

export const SERVED: readonly List[] = [
	{ key: 'a', items: [{ id: 1, label: 'A1', on: true }, { id: 2, label: 'A2', on: false }] },
	{ key: 'b', items: [{ id: 3, label: 'B3', on: true }] },
];

const nextId = (items: readonly Entry[]) => Math.max(0, ...items.map((item) => item.id)) + 1;
const first = (lists: readonly List[], change: (items: readonly Entry[]) => readonly Entry[]) =>
	lists.map((list, at) => (at === 0 ? { ...list, items: change(list.items) } : list));

export const ops: Record<string, (lists: readonly List[]) => readonly List[]> = {
	'add-list': (lists) => {
		const id = nextId(lists.flatMap((list) => list.items));
		return [...lists, { key: 'c' + id, items: [{ id, label: 'C' + id, on: true }] }];
	},
	'prepend-item': (lists) => {
		const id = nextId(lists.flatMap((list) => list.items));
		return first(lists, (items) => [{ id, label: 'N' + id, on: true }, ...items]);
	},
	flip: (lists) => first(lists, (items) => items.map((item, at) => (at === 0 ? { ...item, on: !item.on } : item))),
	relabel: (lists) => first(lists, (items) => items.map((item) => ({ ...item, label: item.label + 'x' }))),
	'reverse-lists': (lists) => [...lists].reverse(),
	'reverse-items': (lists) => first(lists, (items) => [...items].reverse()),
	'remove-list': (lists) => lists.slice(1),
	'remove-item': (lists) => first(lists, (items) => items.slice(1)),
};
