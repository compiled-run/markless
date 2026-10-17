import type { Person } from './people.ts';

export function PersonItem({ person }: { readonly person: Person }) @{
	<li data-person={person.id}>{person.name}</li>;
}
