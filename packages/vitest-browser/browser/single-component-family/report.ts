// A plain module function the compiler never rewrites: whatever arrives here is
// exactly what the runtime answered for the handle read that produced it.

export function rosterOf(value: unknown): string {
	if (Array.isArray(value))
		return value.length === 0
			? 'empty'
			: value
					.map((item) =>
						typeof Element !== 'undefined' && item instanceof Element
							? (item.getAttribute('data-name') ?? '?')
							: typeof item,
					)
					.join(',');
	return value === undefined ? 'undefined' : typeof value;
}

export function soleOf(value: unknown): string {
	if (typeof Element !== 'undefined' && value instanceof Element)
		return value.getAttribute('data-name') ?? '?';
	return value === undefined ? 'undefined' : typeof value;
}
