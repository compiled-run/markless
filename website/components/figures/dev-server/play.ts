// Prints the dev server's output a line at a time until the caller stops it.
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const hostOf = (from: Element) => from.closest('figure') ?? from;

/** Stops whatever the figure holding `from` is printing. */
export function halt(from: Element) {
	clearTimeout(timers.get(hostOf(from)));
}

/** Calls `tick` every `ms` until it returns false or `halt` is called. */
export function every(from: Element, ms: number, tick: () => boolean) {
	const host = hostOf(from);
	halt(host);
	const next = () =>
		timers.set(
			host,
			setTimeout(() => {
				if (tick()) next();
			}, ms),
		);
	next();
}

/** The prompt field inside the figure holding `from`. */
export const fieldIn = (from: Element) => hostOf(from).querySelector('input');
