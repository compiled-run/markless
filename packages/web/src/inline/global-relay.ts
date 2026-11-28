import {
	PROTOCOL_GLOBAL_EVENT_ENTER,
	PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE,
	PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES,
	protocolGlobalEvent,
} from '../../../serializer/src/protocol-global-events.ts';
import { relayGlobalEvents } from '../fns/global-relay.ts';

export { relayGlobalEvents };

type RelayDocument = Document & {
	__mEG?: Array<readonly [string, Event]>;
	__mGR?: Set<string>;
};

/** The document and window record names among a page's event names. */
export function globalEventNames(eventNames: ReadonlyArray<string>): string[] {
	return eventNames.filter((eventName) => protocolGlobalEvent(eventName));
}

/** The relay function as authored; a build serves it minified. */
export function authoredGlobalRelaySource(): string {
	return relayGlobalEvents.toString();
}

/** The call a served page appends after its boot, only when its records name a document or window event. */
export function createInlineGlobalRelaySource(
	eventNames: ReadonlyArray<string>,
	relay = authoredGlobalRelaySource(),
): string {
	const names = globalEventNames(eventNames);
	return names.length
		? `;(${relay})(${JSON.stringify(names)},${JSON.stringify(PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE)},${JSON.stringify(PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES)},${JSON.stringify(PROTOCOL_GLOBAL_EVENT_ENTER)});`
		: '';
}

/** Captures document and window events that land while the shell is still parsing, for the relay to replay. */
export function createEarlyGlobalEventCaptureSource(eventNames: ReadonlyArray<string>): string {
	const names = globalEventNames(eventNames);
	return names.length ? `(${captureEarlyGlobalEvents.toString()})(${JSON.stringify(names)});` : '';
}

function captureEarlyGlobalEvents(names: ReadonlyArray<string>): void {
	if (document.readyState !== 'loading') return;
	const current = document as RelayDocument;
	const early = (current.__mEG ||= []);
	const listeners: Array<() => void> = [];
	for (const name of names) {
		const at = name.indexOf('.');
		const target = (globalThis as unknown as Record<string, EventTarget>)[name.slice(0, at)]!;
		const type = name.slice(at + 1);
		const capture = (event: Event) => early.push([name, event]);
		target.addEventListener(type, capture, true);
		listeners.push(() => target.removeEventListener(type, capture, true));
	}
	current.addEventListener(
		'DOMContentLoaded',
		() => {
			for (const remove of listeners) remove();
			delete current.__mEG;
		},
		{ once: true },
	);
}
