import { PROTOCOL_IDLE_EVENT_NAME } from '../../../serializer/src/protocol-event-names.ts';
import { marklessDefer } from '../inline/defer.ts';

type IdleRoot = {
	__mIdleQueue?: Set<Element>;
	__mFired?: WeakSet<Element>;
};

/**
 * Queues one host whose `idle` record the runtime or renderer just bound to it.
 * The queue drains at the next idle period after load: each host still in the
 * page gets one non-bubbling `idle` event, so its record dispatches like any
 * other; a host removed before then is dropped.
 */
export function queueMarklessIdleHost(root: Element, host: Element): void {
	const owner = root as Element & IdleRoot;
	const fired = (owner.__mFired ||= new WeakSet());
	if (fired.has(host)) return;
	const queue = (owner.__mIdleQueue ||= new Set());
	queue.add(host);
	if (queue.size > 1) return;
	marklessDefer().idle(root, () => {
		const due = [...queue];
		queue.clear();
		for (const element of due) {
			if (!element.isConnected || fired.has(element)) continue;
			fired.add(element);
			element.dispatchEvent(new Event(PROTOCOL_IDLE_EVENT_NAME));
		}
	});
}

/** The direct renderer's idle hosts, addressed by the paths its records already carry. */
export function queueMarklessIdleHosts(
	root: Element,
	paths: ReadonlyArray<ReadonlyArray<number>>,
): void {
	for (const path of paths) {
		let host: Node | undefined = root;
		for (const index of path) host = host?.childNodes[index];
		if (host) queueMarklessIdleHost(root, host as Element);
	}
}

/** A client-rendered mount's records live in its runtime, so idle starts it and the runtime queues the hosts. */
export function startMarklessIdleWake(root: Element, start: () => unknown): void {
	marklessDefer().idle(root, () => void start());
}

export type MarklessIdleHost = typeof globalThis & {
	__mIdle?: {
		readonly wake: (root: unknown, start: () => unknown) => void;
		readonly queue: (root: unknown, host: unknown) => void;
	};
};

/** Run by an app or resume module that has an `onIdle` record; the runtime and a client mount reach the queue only through it. */
export function installMarklessIdle(): void {
	(globalThis as MarklessIdleHost).__mIdle ??= {
		wake: (root, start) => startMarklessIdleWake(root as Element, start),
		queue: (root, host) => queueMarklessIdleHost(root as Element, host as Element),
	};
}
