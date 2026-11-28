import {
	PROTOCOL_GLOBAL_EVENT_ENTER,
	PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE,
	PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES,
} from '../../../serializer/src/protocol-global-events.ts';

type RelayDocument = Document & {
	__mEG?: Array<readonly [string, Event]>;
	__mGR?: Set<string>;
};

/** Who was running when a stop call landed: the record name, its owner, and whether it ran as the sync policy. */
type Running = readonly [name: string, owner: Element, policy: boolean];

/** Per browser event: the earliest phase a stop call came from (0 element, 1 document, 2 window, 3 none) and the first immediate stop. */
type StopState = { s: number; c?: Running; i?: Running };

/**
 * One listener per record name for the whole document, installed by a served
 * page's inline call or by an app module that owns such a record. On each event
 * it raises a non-bubbling CustomEvent named after the record at every owner
 * still on the page, in document order, with the browser's event as `detail`;
 * the container's own listener then routes it like any event on that element.
 * Field reads and `preventDefault`/`stopPropagation`/`stopImmediatePropagation`
 * on it reach the browser's event, so a sync policy runs on the real one before
 * the listener returns.
 *
 * The owners of one name are listeners on one target, so they keep the DOM's
 * rules even when their code runs after the browser's dispatch: a stop from an
 * element handler keeps the event from every owner, a document owner's
 * `stopPropagation()` keeps it from window owners only, and
 * `stopImmediatePropagation()` keeps it from the owners after that one.
 */
export function relayGlobalEvents(
	names: ReadonlyArray<string>,
	ownerAttribute: string,
	passive: ReadonlyArray<string>,
	enter: string,
): void {
	const current = document as RelayDocument;
	const relayed = (current.__mGR ||= new Set());
	const selector = (name: string) => `[${CSS.escape(ownerAttribute)}~="${name}"]`;
	const phase = (name?: string) => (name ? (name[0] === 'd' ? 1 : 2) : 0);
	const relay = (name: string, event: Event) => {
		const host = event as Event & { __mG?: StopState };
		let stops = host.__mG;
		if (!stops) {
			const state: StopState = (stops = host.__mG = { s: 3 });
			const stop = event.stopPropagation;
			const stopNow = event.stopImmediatePropagation;
			event.stopPropagation = () => {
				state.s = Math.min(state.s, phase(state.c?.[0]));
				stop.call(event);
			};
			event.stopImmediatePropagation = () => {
				state.s = Math.min(state.s, phase(state.c?.[0]));
				state.i ||= state.c;
				stopNow.call(event);
			};
		}
		const state = stops;
		const at = (globalThis as unknown as Record<string, EventTarget>)[name.slice(0, name.indexOf('.'))];
		for (const owner of current.querySelectorAll(selector(name))) {
			const carrier = new CustomEvent(name, { detail: event });
			for (const key in event)
				if (!(key in carrier)) Object.defineProperty(carrier, key, { get: () => (event as never)[key] });
			carrier.preventDefault = () => event.preventDefault();
			carrier.stopPropagation = () => event.stopPropagation();
			carrier.stopImmediatePropagation = () => event.stopImmediatePropagation();
			(carrier as unknown as Record<string, () => boolean>)[enter] = () => {
				const immediate = state.i;
				if (state.s < phase(name) || (immediate && immediate[0] === name && immediate[1] !== owner && !immediate[2]))
					return false;
				state.c = [name, owner, false];
				if (event.currentTarget !== at)
					Object.defineProperty(event, 'currentTarget', { value: at, configurable: true });
				return true;
			};
			state.c = [name, owner, true];
			owner.dispatchEvent(carrier);
			state.c = undefined;
			if (state.i?.[0] === name) break;
		}
	};
	for (const name of names) {
		if (relayed.has(name)) continue;
		relayed.add(name);
		const at = name.indexOf('.');
		const type = name.slice(at + 1);
		(globalThis as unknown as Record<string, EventTarget>)[name.slice(0, at)]!.addEventListener(
			type,
			(event) => relay(name, event),
			{ passive: passive.includes(type) },
		);
		for (const [early, event] of current.__mEG ?? []) if (early === name) relay(name, event);
	}
}

/** Imported only by an app module whose own records name a document or window event. */
export function marklessRelayGlobalEvents(names: ReadonlyArray<string>): void {
	relayGlobalEvents(
		names,
		PROTOCOL_GLOBAL_EVENT_OWNER_ATTRIBUTE,
		PROTOCOL_PASSIVE_GLOBAL_EVENT_TYPES,
		PROTOCOL_GLOBAL_EVENT_ENTER,
	);
}
