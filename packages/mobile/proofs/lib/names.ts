/** The first letter of each word, upper case: `Ada Lovelace` is `AL`. */
export function initials(name: string): string {
	return name
		.split(' ')
		.filter((part) => part.length > 0)
		.map((part) => part.charAt(0).toUpperCase())
		.join('');
}

/** Words shortest first, then in alphabetical order. */
export function byLength(words: readonly string[]): string[] {
	return [...words].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
}
