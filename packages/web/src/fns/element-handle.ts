import type { OverlayFocusOriginHost } from '../overlay-handoff.ts';
import type { ResumeElementHandleValue } from '../resume-types.ts';

/**
 * Focus asked for inside a handler lands after that handler's writes reach the
 * DOM.
 *
 * A handler writes `open = true` and focuses the surface on the next line, but
 * the surface is still `hidden` there: the commit is a microtask behind, because
 * a binding's DOM-update symbol is demand-loaded (`resume-runtime.ts`) and the
 * graph flush that awaits it is scheduled, not inline. Native `focus()` on a
 * hidden or inert target is a silent no-op, so a call the target REFUSED is
 * remembered and replayed once the commit the same dispatch performs has landed.
 *
 * Only elements a handler reached through the runtime get this, and only a
 * refused call is ever held: a focus that took is left exactly where it
 * happened.
 *
 * Reaching through the runtime has two spellings, because an overlay's closing
 * handler has no handle for where focus was. It reads the element the overlay
 * behaviour captured at enlist off the surface, and that surface IS a handle
 * read - so handing out a surface hands out its captured origin too, or the one
 * focus that most needs holding is the one nothing is watching.
 */

type FocusOptions = { readonly preventScroll?: boolean };
type FocusCall = (options?: FocusOptions) => void;
type HandleElement = {
	focus?: FocusCall;
	readonly isConnected?: boolean;
	readonly ownerDocument?: { readonly activeElement?: unknown } | null;
	__marklessNativeFocus?: FocusCall;
};

const NATIVE = '__marklessNativeFocus';

// The dispatch currently holding uncommitted writes, or 0 for none. A record is
// stamped with the dispatch that made it and is landed only by that same
// dispatch: a focus refused inside an abandoned or superseded dispatch must
// never be replayed onto a page some later gesture has moved on.
let openDispatch = 0;
let nextDispatch = 0;
let pending: { readonly at: number; readonly target: HandleElement; readonly options?: FocusOptions } | undefined;

function installFocusShim(target: HandleElement | undefined): void {
	if (!target || typeof target.focus !== 'function' || target[NATIVE]) return;
	const native = target.focus.bind(target) as FocusCall;
	try {
		Object.defineProperty(target, NATIVE, { value: native, configurable: true });
		Object.defineProperty(target, 'focus', {
			configurable: true,
			writable: true,
			value(options?: FocusOptions) {
				native(options);
				// A focus that took needs nothing more, and one asked for outside a
				// dispatch has no commit to wait for. Only a call the target refused
				// while its own dispatch still holds uncommitted writes is worth
				// replaying: the last such call is the one the handler meant.
				if (openDispatch !== 0 && target.ownerDocument?.activeElement !== target)
					pending = { at: openDispatch, target, options };
			},
		});
	} catch {
		// An element that refuses the shim keeps native focus; the family's own
		// landing is what it was before.
	}
}

/**
 * An enlisted surface carries the focus the page had when it enlisted, and that
 * reading is a raw node the behaviour stored, not a handle. Handing out the
 * surface therefore has to hand out the origin as well: it is done on every
 * read, not once with the shim, because the capture happens at enlist and the
 * surface's handle is usually read long before that.
 */
function reachCapturedFocusOrigin(target: HandleElement | undefined): void {
	const captured = (target as OverlayFocusOriginHost | undefined)?.__marklessOverlayFocusOrigin;
	if (captured) installFocusShim(captured as HandleElement);
}

/** Wraps a dispatch's handle reader so every element it hands out focuses through the runtime. */
export function marklessHandleFocusReader(
	read: (handleIdOrName: string) => ResumeElementHandleValue,
): (handleIdOrName: string) => ResumeElementHandleValue {
	return (handleIdOrName) => {
		const value = read(handleIdOrName);
		if (Array.isArray(value)) for (const item of value) reachThroughRuntime(item as HandleElement);
		else reachThroughRuntime(value as HandleElement | undefined);
		return value;
	};
}

function reachThroughRuntime(target: HandleElement | undefined): void {
	installFocusShim(target);
	reachCapturedFocusOrigin(target);
}

/** Opens the window in which this dispatch's refused `focus()` is held for its commit. */
export function marklessBeginFocusCommit(): number {
	nextDispatch += 1;
	openDispatch = nextDispatch;
	return openDispatch;
}

/**
 * Closes it, landing what this dispatch asked for. Called only once the
 * dispatch's flush has resolved, so the writes that unhid or un-inerted the
 * target are in the DOM and the blur that hiding a focused subtree causes has
 * already fired.
 */
export function marklessEndFocusCommit(dispatch: number): void {
	const held = pending;
	pending = undefined;
	if (openDispatch === dispatch) openDispatch = 0;
	if (held?.at !== dispatch || held.target.isConnected === false) return;
	held.target[NATIVE]?.call(held.target, held.options);
}
