import type { ToastOptions, ToastRecord, ToastTone } from './toaster-types.ts';

/**
 * The queue's whole arithmetic, as plain functions over plain arrays.
 *
 * Nothing here touches the graph. That is not tidiness: a shared() method whose
 * body builds the new array inline - `queue = [...queue, record]`, or even
 * `queue.slice(1)` - is refused by the compiler when the method takes a
 * parameter (`MARKLESS_STATE_STALE_LOCAL_WRITE`). Handing the array to a pure
 * function and writing back what it returns is the shape that lowers, which is
 * why every write in `toaster.tsrx` reads `toaster.queue = someFunctionHere(...)`.
 *. */

/** A message shows for this long unless its caller says otherwise. */
export const DEFAULT_DURATION = 4000;

/** How often the stack asks whether anything is due to leave, in milliseconds. */
export const TICK = 50;

/** The character a tone shows. A row reads it as text, so it cannot be markup. */
export function toneGlyph(tone: ToastTone): string {
	if (tone === 'success') return '✓';
	if (tone === 'warning') return '!';
	if (tone === 'error') return '×';
	return 'i';
}

/** The id a new message gets: the caller's own, or one minted from the count. */
export function toastId(options: ToastOptions | undefined, minted: number): string {
	return options?.id ?? `toast-${minted}`;
}

/**
 * Add a message, or update the one already carrying this id.
 *
 * Updating in place is what a save flow needs: the same id said twice is one
 * message whose words changed, not two messages. Its position in the queue is
 * kept, so a message that was showing does not jump to the back of the line.
 */
export function enqueue(
	held: readonly ToastRecord[],
	id: string,
	title: string,
	options: ToastOptions | undefined,
	now: number,
	fallbackDuration: number,
): ToastRecord[] {
	const duration = options?.duration ?? fallbackDuration;
	const tone: ToastTone = options?.tone ?? 'neutral';
	const record: ToastRecord = {
		id,
		title,
		description: options?.description ?? '',
		tone,
		icon: toneGlyph(tone),
		// A duration that is not a finite number is a message that stays: there is
		// no deadline to serialize, so the queue carries 0 and nothing expires it.
		dueAt: Number.isFinite(duration) ? now + duration : 0,
		remaining: 0,
	};
	const isHeld = held.some((one) => one.id === id);
	return isHeld ? held.map((one) => (one.id === id ? record : one)) : [...held, record];
}

/**
 * Say something, from a consumer's own handler: the queue goes in, the queue
 * with the message in it comes out. The id is the caller's own or is minted from
 * the queue, because a page-scoped counter is not reachable from here.
 */
export function say(
	held: readonly ToastRecord[],
	title: string,
	options?: ToastOptions,
): ToastRecord[] {
	return enqueue(
		held,
		options?.id ?? `toast-${held.length + 1}`,
		title,
		options,
		Date.now(),
		DEFAULT_DURATION,
	);
}

/** Take one message out of the queue. The next waiting one moves up by itself. */
export function dismiss(held: readonly ToastRecord[], id: string): ToastRecord[] {
	return held.filter((one) => one.id !== id);
}

/**
 * Everything still due at this moment.
 *
 * A message waiting its turn ages with the rest: the queue is a line, not a
 * freezer. Sonner counts down only what is showing, which needs the showing
 * count inside the clock - and the count is a prop of `toaster.root`, which a
 * page-scoped graph cannot be seeded with.. */
export function expire(held: readonly ToastRecord[], now: number): ToastRecord[] {
	return held.filter((one) => one.dueAt === 0 || one.dueAt > now);
}

/** Whether anything in the queue is due to leave. */
export function hasExpired(held: readonly ToastRecord[], now: number): boolean {
	return held.some((one) => one.dueAt !== 0 && one.dueAt <= now);
}

/** Where a message stands in the queue: 0 is the front one. */
export function positionOf(held: readonly ToastRecord[], id: string): number {
	return held.findIndex((one) => one.id === id);
}

/**
 * The stacking data a consumer's own styles read: which message this is, and how
 * far back it sits. One string, because one cell read in one position is what
 * stays fresh - a number spliced into an attribute renders once and goes stale.
 */
export function stackingStyle(index: number): string {
	const place = Math.max(0, index);
	return `--index: ${place}; --offset: ${place * 100}%`;
}

/** Stop the clock: each message remembers what is left of its time. */
export function holdAll(held: readonly ToastRecord[], now: number): ToastRecord[] {
	return held.map((one) =>
		one.dueAt === 0 ? one : { ...one, remaining: Math.max(0, one.dueAt - now), dueAt: 0 },
	);
}

/** Start the clock again from where each message stopped. */
export function releaseAll(held: readonly ToastRecord[], now: number): ToastRecord[] {
	return held.map((one) =>
		one.remaining === 0 ? one : { ...one, dueAt: now + one.remaining, remaining: 0 },
	);
}

/** The messages showing right now. The rest are waiting, not lost. */
export function shownSlice(held: readonly ToastRecord[], visible: number): ToastRecord[] {
	return held.slice(0, Math.max(0, visible));
}
