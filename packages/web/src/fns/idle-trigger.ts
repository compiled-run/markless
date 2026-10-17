import {
	PROTOCOL_IDLE_EVENT_NAME,
	PROTOCOL_IDLE_HOST_ATTRIBUTE,
} from '../../../serializer/src/protocol-event-names.ts';

// The longest a busy page may hold an idle handler back once it has loaded.
export const IDLE_TRIGGER_TIMEOUT_MS = 2000;

type IdleRoot = Element & { __marklessIdleWatched?: true };
type IdleDocument = Document & { __marklessIdleFired?: WeakSet<Element> };

/**
 * Raises `idle` once on each marked host under `root`, after the page has
 * loaded and then gone idle. Hosts mounted later (an arm, a row) are picked up
 * by the next idle period; a host removed before then is never found. Written
 * self-contained because the server inlines it as source text.
 */
export function runIdleTrigger(
	root: Element | null,
	eventName: string,
	hostAttribute: string,
	timeout: number,
	prepare?: () => unknown,
): void {
	if (!root || (root as IdleRoot).__marklessIdleWatched) return;
	(root as IdleRoot).__marklessIdleWatched = true;
	// One set per document: a host inside a nested container is under both roots.
	const fired = ((document as IdleDocument).__marklessIdleFired ||= new WeakSet());
	let waiting = false;
	const fire = () => {
		waiting = false;
		const found = [root, ...root.querySelectorAll(`[${hostAttribute}]`)];
		const hosts: Element[] = [];
		for (const host of found)
			if (host.hasAttribute?.(hostAttribute) && !fired.has(host)) {
				fired.add(host);
				hosts.push(host);
			}
		if (hosts.length)
			Promise.resolve(prepare?.()).then(() => {
				for (const host of hosts)
					if (host.isConnected) host.dispatchEvent(new Event(eventName));
			});
	};
	const wait = () => {
		if (waiting || document.readyState !== 'complete') return;
		waiting = true;
		if (typeof requestIdleCallback === 'function') requestIdleCallback(fire, { timeout });
		else setTimeout(fire, 1);
	};
	if (document.readyState !== 'complete') addEventListener('load', wait, { once: true });
	new MutationObserver(wait).observe(root, { childList: true, subtree: true });
	wait();
}

/** `prepare` runs once hosts are due and before they are raised, so their records can register first. */
export function startMarklessIdleTrigger(root: unknown, prepare?: () => unknown): void {
	runIdleTrigger(
		root as Element,
		PROTOCOL_IDLE_EVENT_NAME,
		PROTOCOL_IDLE_HOST_ATTRIBUTE,
		IDLE_TRIGGER_TIMEOUT_MS,
		prepare,
	);
}

/** The trigger as inline source, appended to a served page whose records name an idle event. */
export function createInlineIdleTriggerSource(): string {
	return `;(${runIdleTrigger.toString()})(document.currentScript?.closest('[data-async-container]'),${JSON.stringify(PROTOCOL_IDLE_EVENT_NAME)},${JSON.stringify(PROTOCOL_IDLE_HOST_ATTRIBUTE)},${IDLE_TRIGGER_TIMEOUT_MS});`;
}
