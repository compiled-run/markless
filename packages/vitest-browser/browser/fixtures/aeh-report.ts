// A plain module function, so the witness reads the handle as a VALUE and hands
// it to code the compiler never rewrites: whatever arrives here is exactly what
// the runtime answered for an array-typed element() handle.
export function reportValues(elements: ReadonlyArray<Element>): string {
	return elements.map((element) => element.getAttribute('data-aeh-value') ?? '?').join('|');
}

export function reportCount(elements: ReadonlyArray<Element>): string {
	return String(elements.length);
}
