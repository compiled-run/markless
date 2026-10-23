import { PROTOCOL_VISIBLE_EVENT_NAME } from '../../../serializer/src/protocol-event-names.ts';

// The page lifetime each host was observed in: a navigation that keeps the host starts a new one.
const observed = new WeakMap<object, unknown>();

/** Runs `run` once per page lifetime of `owner`, the first time `host` is on screen. */
export function onceMarklessVisible(host: object, run: () => void, owner: object = host): void {
	const life = (owner as { __mL?: object }).__mL ?? 0;
	if (observed.get(host) === life || typeof IntersectionObserver === 'undefined') return;
	observed.set(host, life);
	const observer = new IntersectionObserver((entries) => {
		if (!entries.some((entry) => entry.isIntersecting)) return;
		observer.disconnect();
		run();
	});
	observer.observe(host as Element);
}

/** A host bound after the runtime's startup observer gets one non-bubbling `visible` event, unless it already fired or left the page. */
export function queueMarklessVisibleHost(root: object, host: object): void {
	onceMarklessVisible(host, () => {
		if (
			(host as Element).isConnected &&
			!(root as { __mFired?: WeakSet<object> }).__mFired?.has(host)
		)
			(host as Element).dispatchEvent(new Event(PROTOCOL_VISIBLE_EVENT_NAME));
	}, root);
}
