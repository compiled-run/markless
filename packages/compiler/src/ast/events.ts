/** Whether a JSX attribute names an event handler: `on` followed by an upper-case letter, as in `onClick`. */
export function isEventAttribute(attribute: string): boolean {
	return (
		attribute.startsWith('on') &&
		attribute.length > 2 &&
		attribute[2] === attribute[2]!.toUpperCase()
	);
}

/** The DOM event an `on*` attribute listens to: `onPointerDownCapture` is `pointerdown`. */
export function normalizeEventName(attribute: string): string {
	let name = attribute.slice(2);
	const lower = name.toLowerCase();
	if (name.endsWith('Capture') && lower !== 'gotpointercapture' && lower !== 'lostpointercapture') {
		name = name.slice(0, -7);
	}
	return name.toLowerCase();
}
