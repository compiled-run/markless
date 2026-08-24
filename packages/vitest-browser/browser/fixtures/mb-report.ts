// The handle VALUES leave the widget module as arguments to plain helpers, so
// every read below has to be materialized at the call - the same shape the
// families use, rather than a read the compiler could fold away.

export function reportValues(members: ReadonlyArray<Element>): string {
	return members.map((member) => member.getAttribute('data-mb-value') ?? '').join('|');
}

export function reportTagNames(members: ReadonlyArray<Element>): string {
	return members.map((member) => member.tagName.toLowerCase()).join('|');
}

export function reportOne(element: Element | undefined): string {
	return element ? (element.getAttribute('data-mb-value') ?? element.tagName.toLowerCase()) : '-';
}

export function reportMarker(element: Element | undefined): string {
	if (!element) return '-';
	return element
		.getAttributeNames()
		.filter((name) => name.startsWith('data-mb-'))
		.join('|');
}

// Both handle reads of one handler leave together, so neither can fold away:
// the item's own element and the whole set its group holds.
const orders: string[] = [];

export function appendOrder(element: Element | undefined, order: string): string {
	orders.push(`${reportOne(element)}=${order}`);
	return orders.join(' ');
}

// One module, one array, however many lazy symbol chunks import it: the running
// order of handlers compiled into DIFFERENT modules is only observable from a
// place both of them can reach.
const trail: string[] = [];

export function mark(name: string): string {
	trail.push(name);
	return trail.join('|');
}

export function resetTrail(): string {
	trail.length = 0;
	return '';
}
