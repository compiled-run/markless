export function fullName(person: { first: string; last: string }): string {
	return `${person.first} ${person.last}`;
}

export function shout(profile: { name: string }): string {
	return profile.name.toUpperCase();
}
