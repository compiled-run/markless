// Plain module functions the compiler never rewrites: whatever arrives here is
// exactly what the runtime answered for the handle read that produced it.
// Every DOM global is guarded, because a derive that reads a handle is also
// evaluated where no DOM globals exist - see `hasElementGlobal`.

function isElement(value: unknown): value is Element {
	return typeof Element !== 'undefined' && value instanceof Element;
}

export function hasElementGlobal(): string {
	return typeof Element === 'undefined' ? 'no-dom' : 'dom';
}

export function countOf(value: unknown): string {
	if (Array.isArray(value)) return String(value.length);
	return value === undefined ? 'undefined' : typeof value;
}

export function tagOf(value: unknown): string {
	if (isElement(value)) return value.tagName.toLowerCase();
	return value === undefined ? 'undefined' : typeof value;
}

export function widthOf(value: unknown): string {
	if (!isElement(value)) return value === undefined ? 'undefined' : typeof value;
	return `${Math.round(value.getBoundingClientRect().width)}px`;
}
