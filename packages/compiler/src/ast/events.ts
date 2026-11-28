import { protocolGlobalEventName, type ProtocolGlobalEventTarget } from '@markless/serializer/protocol-global-events';
import { DOCUMENT_EVENT_TYPES, WINDOW_EVENT_TYPES } from './global-event-types.generated.ts';

/** Whether a JSX attribute names an event handler: `on` followed by an upper-case letter, as in `onClick`. */
export function isEventAttribute(attribute: string): boolean {
	return (
		attribute.startsWith('on') &&
		attribute.length > 2 &&
		attribute[2] === attribute[2]!.toUpperCase()
	);
}

const GLOBAL_EVENT_PREFIXES = [
	['onDocument', 'document'],
	['onWindow', 'window'],
] as const;

/**
 * The page-wide target an `on*` attribute listens on, and the DOM type it names:
 * `onDocumentKeyDown` is `document` and `keydown`, `onWindowResize` is `window`
 * and `resize`. Undefined for an element's own event.
 */
export function globalEventAttribute(attribute: string):
	| {
			readonly target: ProtocolGlobalEventTarget;
			readonly type: string;
			/** The written prefix, `onDocument` or `onWindow`. */
			readonly prefix: string;
	  }
	| undefined {
	for (const [prefix, target] of GLOBAL_EVENT_PREFIXES) {
		const first = attribute[prefix.length];
		if (attribute.startsWith(prefix) && first !== undefined && first !== first.toLowerCase())
			return { target, type: elementEventType(attribute.slice(prefix.length)), prefix };
	}
	return undefined;
}

/** Whether `type` is a DOM event that reaches `target`: dispatched at it, or bubbling up to it. */
export function isGlobalEventType(target: ProtocolGlobalEventTarget, type: string): boolean {
	return (target === 'document' ? DOCUMENT_EVENT_TYPES : WINDOW_EVENT_TYPES).has(type);
}

const BUBBLING_COUNTERPART: Readonly<Record<string, readonly [type: string, spelled: string]>> = {
	focus: ['focusin', 'FocusIn'],
	blur: ['focusout', 'FocusOut'],
	mouseenter: ['mouseover', 'MouseOver'],
	mouseleave: ['mouseout', 'MouseOut'],
	pointerenter: ['pointerover', 'PointerOver'],
	pointerleave: ['pointerout', 'PointerOut'],
};

/**
 * The prop to write instead of a document or window prop whose event never reaches its target:
 * the bubbling form on the same target (`onDocumentFocus` is `onDocumentFocusIn`), or the same
 * event on the other target (`onDocumentResize` is `onWindowResize`).
 */
export function globalEventAlternative(
	attribute: string,
):
	| { readonly attribute: string; readonly type: string; readonly reason: 'bubbles' | 'other-target' }
	| undefined {
	const global = globalEventAttribute(attribute);
	if (!global) return undefined;
	const counterpart = BUBBLING_COUNTERPART[global.type];
	if (counterpart && isGlobalEventType(global.target, counterpart[0]))
		return { attribute: global.prefix + counterpart[1], type: counterpart[0], reason: 'bubbles' };
	const other = global.target === 'document' ? 'window' : 'document';
	if (isGlobalEventType(other, global.type))
		return {
			attribute: (other === 'document' ? 'onDocument' : 'onWindow') + attribute.slice(global.prefix.length),
			type: global.type,
			reason: 'other-target',
		};
	return undefined;
}

/** The event an `on*` attribute listens to: `onPointerDownCapture` is `pointerdown`, `onDocumentKeyDown` is `document.keydown`. */
export function normalizeEventName(attribute: string): string {
	const global = globalEventAttribute(attribute);
	if (global) return protocolGlobalEventName(global.target, global.type);
	return elementEventType(attribute.slice(2));
}

function elementEventType(spelled: string): string {
	let name = spelled;
	const lower = name.toLowerCase();
	if (name.endsWith('Capture') && lower !== 'gotpointercapture' && lower !== 'lostpointercapture') {
		name = name.slice(0, -7);
	}
	return name.toLowerCase();
}
