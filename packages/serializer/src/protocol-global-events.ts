/**
 * A record for a document or window event is named `<target>.<type>`
 * (`document.keydown`, `window.resize`); no element event name contains the separator.
 */
export const PROTOCOL_GLOBAL_EVENT_SEPARATOR = '.';

/** Listened for passively: the browser treats these as passive on the document and window, and `scroll` cannot be cancelled. */
export const PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES: ReadonlyArray<string> = [
	'scroll',
	'touchmove',
	'touchstart',
	'wheel',
];

/** Written on every element that owns a document or window record, naming them space-separated; a relay finds the owners still on the page by it. */
export const PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE = 'm:g';

/**
 * The relay's carrier event holds a function under this name; a compiled document or window
 * handler calls it first. It returns false when the browser's event was stopped before this
 * owner's turn, and otherwise points the browser's event's `currentTarget` at the document or window.
 */
export const PROTOCOL_GLOBAL_EVENT_ENTER = '__mGo';

/** The two page-wide targets an element can own a listener on: `onDocumentKeyDown`, `onWindowResize`. */
export type ProtocolGlobalEventTarget = 'document' | 'window';

export function protocolGlobalEventName(target: ProtocolGlobalEventTarget, type: string): string {
	return target + PROTOCOL_GLOBAL_EVENT_SEPARATOR + type;
}

/** The target and DOM type a record name listens on, or undefined for an element event. */
export function protocolGlobalEvent(
	eventName: string,
): { readonly target: ProtocolGlobalEventTarget; readonly type: string } | undefined {
	const at = eventName.indexOf(PROTOCOL_GLOBAL_EVENT_SEPARATOR);
	if (at < 0) return undefined;
	const target = eventName.slice(0, at);
	return target === 'document' || target === 'window'
		? { target, type: eventName.slice(at + 1) }
		: undefined;
}
