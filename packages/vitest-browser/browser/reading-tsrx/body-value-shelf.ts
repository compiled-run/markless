export function describeShelf(shelf: { readonly label: string; readonly tags: readonly string[] }) {
	return `${shelf.label.toUpperCase()}/${shelf.tags.length}`;
}
