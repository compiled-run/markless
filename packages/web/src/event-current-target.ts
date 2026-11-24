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
	const restoreCapture = replayedPointerCapture(event);
	try {
		return run(context);
	} finally {
		restoreCapture?.();
		if (aimed) delete target.currentTarget;
	}
}

// On the window once a replayed press took a capture: the dispatch queue aims that pointer's later events with it.
export const POINTER_CAPTURE_PROPERTY = '__mPC';

type PointerFacts = { readonly type: string; readonly eventPhase?: number; readonly pointerId?: number; readonly timeStamp: number };
// Per pointer: the element a replayed press captured it to, and the span of its events the browser sent before that capture existed.
const heldCaptures = new Map<number | undefined, [element: Element, from: number, until: number]>();

// A press that waited for its code takes its capture late: the events the browser already aimed elsewhere are handed to the capturing element.
function replayedPointerCapture(event: unknown): (() => void) | undefined {
	const { eventPhase, pointerId: id, timeStamp } = Object(event) as PointerFacts;
	const proto = globalThis.Element?.prototype;
	if (eventPhase !== 0 || id == null || !proto) return;
	const { setPointerCapture: set, hasPointerCapture: has, releasePointerCapture: release } = proto;
	// The pointer may have lifted while the code loaded; on time the call would have found it.
	const call = (native: (pointerId: number) => void, element: Element, pointerId: number) => {
		try {
			native.call(element, pointerId);
		} catch (error) {
			if (pointerId !== id || (error as DOMException).name !== 'NotFoundError') throw error;
		}
	};
	proto.setPointerCapture = function (pointerId) {
		call(set, this, pointerId);
		if (pointerId !== id) return;
		heldCaptures.set(id, [this, timeStamp, performance.now()]);
		Reflect.set(globalThis, POINTER_CAPTURE_PROPERTY, marklessCapturedInput);
	};
	proto.hasPointerCapture = function (pointerId) {
		const held = heldCaptures.get(pointerId);
		return has.call(this, pointerId) || (held?.[0] === this && timeStamp >= held[1] && timeStamp <= held[2]);
	};
	proto.releasePointerCapture = function (pointerId) {
		const held = heldCaptures.get(pointerId);
		if (held?.[0] === this) held[2] = Math.min(held[2], timeStamp);
		call(release, this, pointerId);
	};
	return () => Object.assign(proto, { setPointerCapture: set, hasPointerCapture: has, releasePointerCapture: release });
}

/** A queued dispatch of a pointer event a replayed capture covers, aimed at the capturing element; any other dispatch as it came. */
export function marklessCapturedInput<I extends { readonly root: { contains?(node: unknown): boolean }; readonly event: unknown }>(
	input: I,
): I {
	const event = Object(input.event) as PointerFacts & { target?: unknown; __marklessPressPath?: unknown[] };
	const held = heldCaptures.get(event.pointerId);
	if (!held || event.type === 'pointerdown' || event.timeStamp < held[1] || event.timeStamp > held[2]) return input;
	if (event.type === 'pointerup' || event.type === 'pointercancel') held[2] = event.timeStamp;
	if (event.target === held[0] || !input.root.contains?.(held[0])) return input;
	Object.defineProperty(event, 'target', { value: held[0], configurable: true });
	event.__marklessPressPath = [held[0]];
	return { ...input, element: held[0], eventRecord: null, eventIndex: undefined };
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
 * `control` is the element whose handler runs, held busy from the write's send until that settle; a submit's form holds itself.
 * `wrote` names, per graph, the state the dispatch's own synchronous run wrote.
 */
export type DispatchSpan = {
	open: boolean;
	closed?: () => void;
	refreshed?: Promise<void>;
	wrote?: Map<object, Set<string>>;
	readonly control?: Element;
};

type DispatchingHost = { __marklessDispatching?: DispatchSpan };

/** The dispatch whose handler is in its synchronous run now: a write sent then is that dispatch's own. */
export function currentDispatch(): DispatchSpan | undefined {
	return (globalThis as DispatchingHost).__marklessDispatching;
}

/** Runs `handler` as `span`'s own synchronous run. */
export function runAsDispatchOwn<T>(span: DispatchSpan, handler: () => T): T {
	const host = globalThis as DispatchingHost;
	const outer = host.__marklessDispatching;
	host.__marklessDispatching = span;
	try {
		return handler();
	} finally {
		host.__marklessDispatching = outer;
	}
}

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
	// A field named `elements` would shadow the form's own list.
	const elements =
		globalThis.HTMLFormElement && form instanceof HTMLFormElement
			? Reflect.get(HTMLFormElement.prototype, 'elements', form)
			: form.elements;
	return JSON.stringify(
		Array.from(elements as ArrayLike<SubmitControl>, (control) => [
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
