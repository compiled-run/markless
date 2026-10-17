export type Person = { readonly id: string; readonly name: string };

export const PEOPLE: readonly Person[] = [
	{ id: 'p1', name: 'Ada' },
	{ id: 'p2', name: 'Brian' },
	{ id: 'p3', name: 'Cleo' },
];

export function matching(people: readonly Person[], needle: string): Person[] {
	return people.filter((person) => person.name.toLowerCase().includes(needle.toLowerCase()));
}
