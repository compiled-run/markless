import type { KeptSubmission } from './inline/sync-policy-core.ts';

// A handler runs after the browser's listener returned; currentTarget names its element for its synchronous part.
export function marklessRunAtCurrentTarget<A, T>(
	event: unknown,
	element: unknown,
	run: (context: A) => T,
	context: A,
): T {
	const target = Object(event) as { currentTarget?: unknown };
	const aimed = Reflect.defineProperty(target, 'currentTarget', { value: element, configurable: true });
	try {
		return run(context);
	} finally {
		if (aimed) delete target.currentTarget;
	}
}

// Events a container has not handled yet; an in-place navigation waits for them.
export const CONTAINER_HANDLING_PROPERTY = '__mH';

type ContainerHandling = Map<object, readonly [handled: Promise<unknown>, settle: () => void]>;
export type HandlingRoot = { [CONTAINER_HANDLING_PROPERTY]?: ContainerHandling };

export function marklessEventHandled(root: object, event: unknown): void {
	(root as HandlingRoot)[CONTAINER_HANDLING_PROPERTY]?.get(event as object)?.[1]();
}

// The DOM dispatches in flight, kept on the window so the click path loads none of the write watch.
export const MARKLESS_DISPATCHES_GLOBAL = '__marklessDispatches';

/**
 * A dispatch's user-action token: `open` until its handlers return. The write watch sets `closed` to hear when its flush ends,
 * and `refreshed` when it sends a write: it settles once the reload that write caused has landed, or at once when none follows.
 */
export type DispatchSpan = { open: boolean; closed?: () => void; refreshed?: Promise<void> };

export function dispatchSpans(): Set<DispatchSpan> {
	const host = globalThis as { [MARKLESS_DISPATCHES_GLOBAL]?: Set<DispatchSpan> };
	return (host[MARKLESS_DISPATCHES_GLOBAL] ??= new Set());
}

type SubmitControl = {
	readonly value?: unknown;
	readonly checked?: unknown;
	readonly selectedOptions?: ArrayLike<{ readonly value: string }>;
	readonly files?: ArrayLike<{ readonly name: string; readonly size: number; readonly lastModified: number }> | null;
};

/** What a submit carries: every control's value, checked state, chosen options and files, read before any handler runs. */
export function submitRecord(form: { readonly elements: ArrayLike<unknown> }): string {
	return JSON.stringify(
		Array.from(form.elements as ArrayLike<SubmitControl>, (control) => [
			control.files
				? Array.from(control.files, (file) => [file.name, file.size, file.lastModified])
				: control.selectedOptions
					? Array.from(control.selectedOptions, (option) => option.value)
					: control.value,
			control.checked,
		]),
	);
}

type BusyHost = { setAttribute?(name: string, value: string): void; removeAttribute?(name: string): void };
const busyOwners = new WeakMap<BusyHost, Set<object>>();

/** aria-busy on an element is true while any owner holds it: a refresh showing its value, or a submission it sends. */
export function holdBusy(host: BusyHost, owner: object, busy: boolean): void {
	let owners = busyOwners.get(host);
	if (busy) busyOwners.set(host, (owners ??= new Set()).add(owner));
	else owners?.delete(owner);
	if (owners?.size) host.setAttribute?.('aria-busy', 'true');
	else {
		busyOwners.delete(host);
		host.removeAttribute?.('aria-busy');
	}
}

/** The submission the in-place check kept from the browser for this event (`__mKept`, written by its serialized source), once the event is done. */
export function keptSubmission(event: object): Promise<KeptSubmission | undefined> | undefined {
	return (event as { __mKept?: Promise<KeptSubmission | undefined> }).__mKept;
}
