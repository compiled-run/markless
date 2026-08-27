/**
 * An `async function` hands back a promise however warm its inputs are, and an
 * `await` on a settled promise still yields the statement its caller is inside.
 * A client minting a `@for` row at the write has no statement to spare, so the
 * render chain is spelled as continuations instead: every step answers with a
 * value when nothing had to be waited for, and with a promise when something
 * did. Callers may keep awaiting it either way.
 */
export type Awaitable<T> = T | Promise<T>;

export function marklessIsThenable<T>(value: Awaitable<T>): value is Promise<T> {
	return typeof (value as { readonly then?: unknown } | null | undefined)?.then === 'function';
}

export function marklessThen<A, B>(
	value: Awaitable<A>,
	next: (value: A) => Awaitable<B>,
): Awaitable<B> {
	return marklessIsThenable(value) ? value.then(next) : next(value);
}

/** `then` with the `finally` of the await it replaces: released on both edges. */
export function marklessSettled<A, B>(
	value: Awaitable<A>,
	release: () => void,
	next: (value: A) => B,
): Awaitable<B> {
	if (!marklessIsThenable(value)) {
		release();
		return next(value);
	}
	return value.then(
		(settled) => {
			release();
			return next(settled);
		},
		(error) => {
			release();
			throw error;
		},
	);
}

/**
 * A `for` loop whose body may answer with a promise, resumed where it stopped.
 *
 * The sequential spelling matters: each step's writes are what the next step
 * reads, so a step that waits must not let the ones behind it run past it.
 */
export function marklessWalk(
	length: number,
	step: (index: number) => Awaitable<unknown>,
): Awaitable<void> {
	const resume = (from: number): Awaitable<void> => {
		for (let index = from; index < length; index += 1) {
			const answered = step(index);
			if (marklessIsThenable(answered)) return answered.then(() => resume(index + 1));
		}
		return undefined;
	};
	return resume(0);
}
