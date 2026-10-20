export function watch(element: HTMLElement, label = 'watched'): void {
	element.setAttribute('data-watched', label);
}
