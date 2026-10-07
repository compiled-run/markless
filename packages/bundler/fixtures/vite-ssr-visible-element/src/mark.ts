export function mark(items: readonly string[]) {
	return (element: HTMLElement) => {
		element.setAttribute('data-attached', String(items.length));
	};
}
