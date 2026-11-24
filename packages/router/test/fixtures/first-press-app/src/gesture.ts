// Plain helpers the page's handlers call: what a figure keeps in its own model module.

export function press(element: Element, count: number, write: (next: number) => void): void {
	element.classList.add('pressed');
	element.removeAttribute('data-held');
	write(count + 1);
}

export function capture(event: { readonly currentTarget: unknown; readonly pointerId: number }): void {
	(event.currentTarget as Element).setPointerCapture(event.pointerId);
}

export function seen(event: Event & { readonly key?: string; readonly pointerId?: number }): string {
	const named = (target: EventTarget | null) => (target as Element | null)?.getAttribute?.('data-name') ?? String(target);
	return [event.type, named(event.currentTarget), named(event.target), event.key ?? event.pointerId ?? ''].join(' ');
}
