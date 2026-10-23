import { PROTOCOL_VISIBLE_EVENT_NAME } from '../../../serializer/src/protocol-event-names.ts';

const observed = new WeakSet<object>();

/** Runs `run` once, the first time `host` is on screen. */
export function onceMarklessVisible(host: object, run: () => void): void {
	if (observed.has(host) || typeof IntersectionObserver === 'undefined') return;
	observed.add(host);
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
	});
}
