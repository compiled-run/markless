import type { Page } from '@playwright/test';

type SettledWindow = { __dispatchesSettled(): Promise<void> };

function trackListenerPromises() {
	let inFlight = 0;
	let waiters: Array<() => void> = [];
	const wrappers = new WeakMap<object, EventListener>();
	const add = EventTarget.prototype.addEventListener;
	const remove = EventTarget.prototype.removeEventListener;
	const done = () => {
		if (--inFlight > 0) return;
		const ready = waiters;
		waiters = [];
		for (const wake of ready) wake();
	};
	const wrap = (listener: EventListener) => {
		let wrapper = wrappers.get(listener);
		if (!wrapper) {
			wrapper = function (this: unknown, event: Event) {
				const result = listener.call(this, event) as unknown;
				if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
					inFlight++;
					// The DOM drops a listener's promise, so a rejection stays unhandled exactly as it would untracked.
					(result as PromiseLike<unknown>).then(done, (error: unknown) => {
						done();
						void Promise.reject(error);
					});
				}
				return result as never;
			};
			wrappers.set(listener, wrapper);
		}
		return wrapper;
	};
	EventTarget.prototype.addEventListener = function (type, listener, options) {
		return add.call(this, type, typeof listener === 'function' ? wrap(listener) : listener, options);
	};
	EventTarget.prototype.removeEventListener = function (type, listener, options) {
		const wrapper = typeof listener === 'function' ? wrappers.get(listener) : undefined;
		return remove.call(this, type, wrapper ?? listener, options);
	};
	const settled = async () => {
		for (;;) {
			if (inFlight > 0) await new Promise<void>((wake) => waiters.push(wake));
			await new Promise((next) => requestAnimationFrame(() => setTimeout(next)));
			if (inFlight === 0) return;
		}
	};
	(window as unknown as SettledWindow).__dispatchesSettled = () =>
		Promise.race([
			settled(),
			new Promise<never>((_, hung) =>
				setTimeout(() => hung(new Error('an event dispatch never settled')), 30_000),
			),
		]);
}

/** Before `goto`: records every promise an event listener returns, which is how the resumer and runtimes hand back a dispatch. */
export function trackDispatches(page: Page): Promise<void> {
	return page.addInitScript(trackListenerPromises);
}

/** Resolves once every dispatched event's promise has settled and a frame plus a task have passed with none started. */
export function dispatchesSettled(page: Page): Promise<void> {
	return page.evaluate(() => (window as unknown as SettledWindow).__dispatchesSettled());
}
