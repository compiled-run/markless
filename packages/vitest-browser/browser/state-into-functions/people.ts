export type Person = { first: string; last: string; tags: string[] };

export function rename(person: { first: string }, next: string): void {
	person.first = next;
}

export function addTag(list: string[], tag: string): void {
	list.push(tag);
}

export function patchById(items: Array<{ id: number; n: number }>, id: number, n: number): void {
	const hit = items.find((item) => item.id === id);
	if (hit) hit.n = n;
}

export function label(person: Person): string {
	return `${person.first} ${person.last} (${person.tags.length})`;
}
