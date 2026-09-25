import type { RuntimeGraph } from '@markless/runtime';
import { protocolEventDispatchesMarkless } from '@markless/serializer/protocol';
import {
	marklessInstancePath,
	marklessRecordRowScope,
	marklessRowScopedGraph,
	type MarklessRowScope,
	type MarklessScopedGraph,
} from './fns/instance-scope.ts';
import { marklessCodedError } from './coded-error.ts';
import { marklessEditableControl, marklessNoteControlEdits } from './control-edit-hold.ts';
import type { OverlayFocusOriginHost } from './overlay-handoff.ts';
import type {
	ElementHandleRegistry,
	ResumeDispatchOptions,
	ResumeDomElement,
	ResumeDomEvent,
	ResumeElementHandleValue,
	ResumeEventRecord,
	ResumeKeyedRepeatRecord,
	ResumeKeyedRepeatRowEvent,
	ResumeRuntimeErrorContext,
	ResumeRuntimeInput,
	ResumeSymbolContext,
} from './resume-types.ts';

// Only the CSR activation seam is graph-less, and it never reaches dispatch:
// every context built here carries `input.graph`. Dispatch declares that shape
// for itself rather than re-checking a graph it is holding.
type DispatchSymbolContext = Omit<ResumeSymbolContext, 'graph'> & {
	readonly graph: RuntimeGraph;
};

export type ResumeRowEventMatch = {
	readonly repeat: ResumeKeyedRepeatRecord;
	readonly parent: ResumeDomElement;
	readonly rowRoot: ResumeDomElement;
	readonly rowKey: unknown;
	readonly rowEvent: ResumeKeyedRepeatRowEvent;
};
export type ResumeRowEventRecords = WeakMap<ResumeDomElement, Map<string, ResumeRowEventMatch>>;
/** A row a keyed repeat took out, carrying the parent it hung from. */
export type DisposedRepeatRow = ResumeDomElement & {
	__marklessRowParent?: ResumeDomElement;
};
export type ResumeEventWiring = ReturnType<typeof createEventWiring>;
type ExecutionLogGlobal = typeof globalThis & {
	__mxLog?: Set<string>;
	__mxLoadLog?: () => Promise<{ readonly logMarklessInteraction?: (input: unknown) => void }>;
	__mxLogInteraction?: (input: {
		readonly eventName: string;
		readonly eventRecord?: ResumeEventRecord | ResumeKeyedRepeatRowEvent | null;
		readonly before?: ReadonlySet<string>;
		readonly after?: ReadonlySet<string>;
		readonly view: ResumeRuntimeInput['view'];
		readonly selector?: string;
		readonly dispatchModuleId?: string;
		readonly noMatch?: boolean;
	}) => void | Promise<void>;
};

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
 * A call the target TOOK is held too, because a commit can undo it: a keyed
 * repeat re-inserts the rows it keeps, and moving or removing the focused node
 * resets the page to `<body>`. Such a hold lands only if the document fell back
 * to its body - focus that some other element claimed is left alone.
 *
 * A field, though, is not focused while the dispatch still has writes waiting
 * on its commit: the call is made once that commit lands, so the value and
 * caret the field is focused with are the ones the handler wrote.
 *
 * Only elements a handler reached through the runtime get this.
 *
 * Reaching through the runtime has two spellings, because an overlay's closing
 * handler has no handle for where focus was. It reads the element the overlay
 * behaviour captured at enlist off the surface, and that surface IS a handle
 * read - so handing out a surface hands out its captured origin too, or the one
 * focus that most needs holding is the one nothing is watching.
 *
 * It lives in the dispatch module rather than beside the handle helpers because
 * progressive execution lets a plain click execute the dispatch core path and
 * nothing else; a module of its own would load on every press that reads no
 * handle at all.
 */
type FocusOptions = { readonly preventScroll?: boolean };
type FocusCall = (options?: FocusOptions) => void;
type HandleElement = {
	focus?: FocusCall;
	readonly isConnected?: boolean;
	readonly ownerDocument?: {
		readonly activeElement?: unknown;
		readonly body?: unknown;
	} | null;
	__marklessNativeFocus?: FocusCall;
};

const NATIVE_FOCUS = '__marklessNativeFocus';

// The dispatch currently holding uncommitted writes, or 0 for none. A record is
// held under the dispatch that made it and is landed only by that same dispatch:
// a focus refused inside an abandoned or superseded dispatch must never be
// replayed onto a page some later gesture has moved on, and dispatches overlap -
// a handler that dispatches a synthetic event opens a second window inside the
// first - so one ending must not take the other's hold with it.
let openFocusDispatch = 0;
let nextFocusDispatch = 0;
const pendingFocus = new Map<
	number,
	{
		readonly target: HandleElement;
		readonly options?: FocusOptions;
		readonly took: boolean;
	}
>();
let openCommitPending: (() => boolean) | undefined;

function installFocusShim(target: HandleElement | undefined): void {
	if (!target || typeof target.focus !== 'function' || target[NATIVE_FOCUS]) return;
	const native = target.focus.bind(target) as FocusCall;
	try {
		Object.defineProperty(target, NATIVE_FOCUS, { value: native, configurable: true });
		Object.defineProperty(target, 'focus', {
			configurable: true,
			writable: true,
			value(options?: FocusOptions) {
				// Uncommitted writes land first, so focus never arrives on text about to change.
				const held = openCommitPending?.() && marklessEditableControl(target);
				if (!held) native(options);
				// A call outside a dispatch has no commit to wait for. Inside one, the
				// last call is the one the handler meant, whether the target refused it
				// or took it: the commit can undo either.
				if (openFocusDispatch !== 0)
					pendingFocus.set(openFocusDispatch, {
						target,
						options,
						took: target.ownerDocument?.activeElement === target,
					});
			},
		});
	} catch {
		// An element that refuses the shim keeps native focus; the family's own
		// landing is what it was before.
	}
}

function reachThroughRuntime(target: HandleElement | undefined): void {
	installFocusShim(target);
	// An enlisted surface carries the focus the page had when it enlisted, and
	// that reading is a raw node the behaviour stored, not a handle. It is done on
	// every read, not once with the shim, because the capture happens at enlist
	// and the surface's handle is usually read long before that.
	const captured = (target as OverlayFocusOriginHost | undefined)?.__marklessOverlayFocusOrigin;
	if (captured) installFocusShim(captured as HandleElement);
}

/** Wraps a dispatch's handle reader so every element it hands out focuses through the runtime. */
export function marklessHandleFocusReader(
	read: (handleIdOrName: string) => ResumeElementHandleValue,
): (handleIdOrName: string) => ResumeElementHandleValue {
	return (handleIdOrName) => {
		const value = read(handleIdOrName);
		if (Array.isArray(value))
			for (const item of value) reachThroughRuntime(item as HandleElement);
		else reachThroughRuntime(value as HandleElement | undefined);
		return value;
	};
}

/** Opens the window in which this dispatch's `focus()` is held for its commit; `commitPending` says writes still await it. */
export function marklessBeginFocusCommit(commitPending?: () => boolean): number {
	openCommitPending = commitPending;
	return (openFocusDispatch = ++nextFocusDispatch);
}

/**
 * Closes it, landing what this dispatch asked for. Called only once the
 * dispatch's flush has resolved, so the writes that unhid or un-inerted the
 * target are in the DOM, the blur that hiding a focused subtree causes has
 * already fired, and the rows a keyed repeat re-inserted are back in place.
 */
export function marklessEndFocusCommit(dispatch: number): void {
	if (openFocusDispatch === dispatch) {
		openFocusDispatch = 0;
		openCommitPending = undefined;
	}
	const held = pendingFocus.get(dispatch);
	if (!held) return;
	pendingFocus.delete(dispatch);
	if (held.target.isConnected === false) return;
	// A hold whose call took is landed only when the commit dropped focus to the
	// body: an element that claimed focus in the meantime keeps it.
	if (held.took && held.target.ownerDocument?.activeElement !== held.target.ownerDocument?.body)
		return;
	held.target[NATIVE_FOCUS]?.call(held.target, held.options);
}

// Focus reaches an element before any key event can. These are the names a
// focused element can still receive, so a record naming one is a handler the
// page is about to need. Restated in render-csr and in the serialized inline
// boot: neither can reach a shared module without paying a chunk for it.
// A pointer crosses onto a control before it presses it, and Safari focuses no
// button on click - so hover, not focus, is what reliably precedes a first
// press. A focused control still reaches these through Enter and Space.
const PRESS_EVENT_NAMES = ['click', 'pointerdown', 'pointerup'];
// The two lists are written out rather than spread together: they are read on
// every focusin, so they are built once, and the caller only ever iterates them.
const FOCUS_PRELOAD_EVENT_NAMES = [
	'keydown',
	'keyup',
	'keypress',
	'click',
	'pointerdown',
	'pointerup',
];
const EDITABLE_PRELOAD_EVENT_NAMES = [
	'keydown',
	'keyup',
	'keypress',
	'beforeinput',
	'input',
	'change',
	'click',
	'pointerdown',
	'pointerup',
];

function focusPreloadEventNames(element: object): ReadonlyArray<string> {
	return marklessEditableControl(element)
		? EDITABLE_PRELOAD_EVENT_NAMES
		: FOCUS_PRELOAD_EVENT_NAMES;
}

function isFocusPreloadEventName(eventName: string): boolean {
	return EDITABLE_PRELOAD_EVENT_NAMES.includes(eventName);
}

export function createEventWiring(input: {
	readonly root: ResumeDomElement;
	readonly graph: RuntimeGraph;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
	readonly elementsByHostId: Map<string, ResumeDomElement>;
	readonly elementHandles: ElementHandleRegistry;
	readonly view: ResumeRuntimeInput['view'];
	readonly eventTypes: Set<string>;
	readonly disposedHosts: Set<string>;
	readonly ignoredDisposedEventTargets: WeakSet<ResumeDomElement>;
	readonly prepareRuntimeShared: () => Promise<void>;
	readonly flushRuntimeGraph: () => Promise<void>;
	readonly reportRuntimeError: (
		error: unknown,
		context: ResumeRuntimeErrorContext,
	) => Promise<void>;
	readonly activateBehaviorsFromTrigger: (hostNodeId: string) => Promise<void> | undefined;
	readonly behaviorHostIdsForAncestors: (element: ResumeDomElement | undefined) => string[];
	readonly delegatedTriggers?: ResumeRuntimeInput['delegatedTriggers'];
}) {
	const readHandle = marklessHandleFocusReader(input.elementHandles.get);
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>();
	const rowEventRecords: ResumeRowEventRecords = new WeakMap();
	// The detached subtree's own top is the row the repeat took out, and it carries
	// where it hung. That is what lets a dispatch several microtasks behind its
	// press finish the walk the DOM would have given it at press time.
	const detachedRowAnchor = (target: ResumeDomElement): ResumeDomElement | undefined => {
		let current: ResumeDomElement = target;
		for (;;) {
			const parent = current.parentElement;
			if (!parent) return (current as DisposedRepeatRow).__marklessRowParent;
			current = parent;
		}
	};
	let debugRegistrations: Set<Promise<unknown>> | undefined;
	const trackDebug = (pending: Promise<unknown>) => {
		(debugRegistrations ??= new Set()).add(pending);
		void pending.finally(() => debugRegistrations?.delete(pending));
	};
	let runPolicy:
		| undefined
		| ((
				policy: ResumeEventRecord['syncPolicy'],
				graph: RuntimeGraph,
				event: ResumeDomEvent,
		  ) => void);
	const addEventRecord = (element: ResumeDomElement, record: ResumeEventRecord) => {
		let byName = eventRecords.get(element);
		if (!byName) {
			byName = new Map();
			eventRecords.set(element, byName);
		}
		// One element, one listener list. A part's own record and a record the
		// consumer's `{...rest}` forwarded onto the same element arrive as two
		// records - they are compiled by two different modules and only meet here -
		// so the second MERGES into the first instead of replacing it. The part's
		// own symbols stay first: the consumer is adding to the part's behavior,
		// not taking it over. (React's last-writer-wins is the deliberate
		// divergence; this is what two DOM listeners do.)
		const held = byName.get(record.eventName);
		const added = held
			? record.symbolIds.filter((symbolId) => !held.symbolIds.includes(symbolId))
			: [];
		byName.set(
			record.eventName,
			held && held !== record && added.length > 0
				? {
						...held,
						syncPolicy: held.syncPolicy ?? record.syncPolicy,
						symbolIds: [...held.symbolIds, ...added],
					}
				: record,
		);
		input.eventTypes.add(record.eventName);
		input.delegatedTriggers?.registerEventRecord(element, record);
		wantPreload(record.eventName);
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
			trackDebug(
				recordDebugInteraction(
					input.root as unknown as Element,
					element as unknown as Element,
					record.eventName,
					{
						kind: 'resume-record',
						hostNodeId: record.hostNodeId,
						symbolIds: record.symbolIds,
					},
				),
			);
	};
	// Fetch only, never a dispatch: a rejection is left for the dispatch that
	// actually needs the symbol to report.
	const preloadedSymbolIds = new Set<string>();
	let preloadArmed = false;
	const preloadSymbolsFor = (
		target: ResumeDomElement | null | undefined,
		namesFor: (element: ResumeDomElement) => ReadonlyArray<string>,
	): void => {
		for (
			let element: ResumeDomElement | null | undefined = target;
			element;
			element = element.parentElement
		) {
			const byName = eventRecords.get(element);
			if (byName)
				for (const eventName of namesFor(element)) {
					const record = byName.get(eventName);
					if (!record) continue;
					for (const symbolId of record.symbolIds) {
						if (preloadedSymbolIds.has(symbolId)) continue;
						preloadedSymbolIds.add(symbolId);
						void Promise.resolve(input.loadSymbol(symbolId)).catch(() => {});
					}
				}
			if (element === input.root) break;
		}
	};
	// Armed by startup, after the container's dispatch listeners: these only
	// fetch modules and must never sit ahead of the authority that dispatches.
	const preloadTrigger = (
		triggerName: string,
		namesFor: (element: ResumeDomElement) => ReadonlyArray<string>,
	) => {
		let wanted = false,
			release: (() => void) | undefined;
		const listener = (event: ResumeDomEvent) =>
			preloadSymbolsFor(event.target as ResumeDomElement | null, namesFor);
		const wire = (): void => {
			if (!wanted || !preloadArmed || release) return;
			input.root.addEventListener?.(triggerName, listener, { capture: true });
			release = () =>
				input.root.removeEventListener?.(triggerName, listener, { capture: true });
		};
		return {
			want: () => {
				wanted = true;
				wire();
			},
			wire,
			release: () => release?.(),
		};
	};
	const focusPreload = preloadTrigger('focusin', focusPreloadEventNames);
	// pointerenter does not bubble, so a delegated listener would only ever see
	// the container's own crossing.
	const pressPreload = preloadTrigger('pointerover', () => PRESS_EVENT_NAMES);
	const wantPreload = (eventName: string): void => {
		if (isFocusPreloadEventName(eventName)) focusPreload.want();
		if (PRESS_EVENT_NAMES.includes(eventName)) pressPreload.want();
	};
	const armFocusPreload = (): void => {
		preloadArmed = true;
		focusPreload.wire();
		pressPreload.wire();
		// The crossing that woke this runtime happened before the wiring existed,
		// and a resting pointer sends no second one; the boot leaves it here.
		preloadSymbolsFor(
			(input.root as unknown as { readonly __marklessPrimedHover?: ResumeDomElement })
				.__marklessPrimedHover,
			() => PRESS_EVENT_NAMES,
		);
	};
	const preloadFocusKeySymbols = (target: ResumeDomElement | null | undefined): void =>
		preloadSymbolsFor(target, focusPreloadEventNames);
	const releaseFocusPreload = (): void => {
		focusPreload.release();
		pressPreload.release();
	};
	const addRowEvent = (host: ResumeDomElement, match: ResumeRowEventMatch) => {
		let byName = rowEventRecords.get(host);
		if (!byName) {
			byName = new Map();
			rowEventRecords.set(host, byName);
		}
		byName.set(match.rowEvent.eventName, match);
		input.eventTypes.add(match.rowEvent.eventName);
		input.delegatedTriggers?.registerRowEventName(match.rowEvent.eventName);
		if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
			trackDebug(
				recordDebugInteraction(
					input.root as unknown as Element,
					host as unknown as Element,
					match.rowEvent.eventName,
					{
						kind: 'row-record',
						repeatId: match.repeat.id,
						symbolIds: match.rowEvent.symbolIds,
					},
				),
			);
	};
	async function prepareSyncPolicy(
		viewEvents: ReadonlyArray<ResumeEventRecord>,
		rowEvents: ReadonlyArray<ResumeKeyedRepeatRowEvent>,
	): Promise<void> {
		if (![...viewEvents, ...rowEvents].some((record) => record.syncPolicy)) return;
		runPolicy = (await import('./inline/sync-policy-core-lazy.ts'))
			.runSyncPolicyActions as never;
	}
	async function dispatch(
		event: ResumeDomEvent,
		options: ResumeDispatchOptions = {},
	): Promise<void> {
		const target = event.target;
		if (!target) throw unmatchedDispatchError(event, undefined);
		const selector = describeResumeEventTarget(target);
		const ignoredDisposed = input.ignoredDisposedEventTargets.has(target);
		// The browser aimed this event at a page where the row was still there; a
		// keyed repeat has taken the row out since. The parent it left stands in for
		// the link the walk would have crossed at press time.
		const attached = containsElement(input.root, target);
		const anchor = attached ? undefined : detachedRowAnchor(target);
		const rowAnchor = anchor && containsElement(input.root, anchor) ? anchor : undefined;
		if (!attached && !ignoredDisposed && !rowAnchor)
			throw unmatchedDispatchError(event, selector);
		const bubbles = event.bubbles !== false;
		const path = collectDispatchPath(
			target,
			event.type,
			eventRecords,
			rowEventRecords,
			bubbles,
		);
		if (path.length === 0) {
			if (ignoredDisposed) return;
			// A capture listener on the container receives a non-bubbling event from
			// every descendant in turn, so "the target itself carries no record" is the
			// ordinary case rather than a routing defect: the element that does carry
			// one gets its own event when the pointer enters it.
			if (!bubbles) return;
			await marklessLogInteraction({
				eventName: event.type,
				eventRecord: null,
				before: marklessExecutionLogSnapshot(),
				view: input.view,
				selector,
				noMatch: true,
				dispatchModuleId: 'web:resume-events',
			});
			// Broad entry capture (inline resumer / specialized-wrapper fallback)
			// forwards every captured event; non-markless clicks (e.g. router
			// links) must pass through silently rather than throw.
			if (options.ignoreUnmatched === true) return;
			// Reported above before it is let go: a row the app itself removed is
			// not a routing defect, but the no-match still belongs in the log.
			if (rowAnchor) return;
			throw unmatchedDispatchError(event, selector);
		}
		const propagation = trackPropagationStops(event, options.propagationStopped);
		let stopAfterElement: ResumeDomElement | undefined;
		const releaseControlEdits = marklessNoteControlEdits(target);
		try {
			for (const matched of path) {
				if (stopAfterElement && matched.element !== stopAfterElement) return;
				if ('rowMatch' in matched)
					await dispatchRowEvent(
						matched.element,
						matched.rowMatch,
						event,
						options,
						propagation.stoppedImmediate,
					);
				else {
					// A record owned by another system (a router link) ends the markless
					// walk, exactly as it did when only the innermost record ever ran.
					if (!protocolEventDispatchesMarkless(matched.eventRecord)) return;
					await dispatchViewEvent(
						matched.element,
						matched.eventRecord,
						event,
						options,
						selector,
						propagation.stoppedImmediate,
					);
				}
				if (propagation.stoppedImmediate()) return;
				if (propagation.stopped()) stopAfterElement = matched.element;
			}
		} finally {
			propagation.release();
			releaseControlEdits();
		}
	}
	async function dispatchViewEvent(
		element: ResumeDomElement,
		eventRecord: ResumeEventRecord,
		event: ResumeDomEvent,
		options: ResumeDispatchOptions,
		selector: string,
		stopsImmediately?: () => boolean,
	): Promise<void> {
		await runRecordSymbols(
			element,
			eventRecord,
			eventRecord.hostNodeId,
			event,
			options,
			selector,
			marklessExecutionLogSnapshot(),
			stopsImmediately,
			async () => {
				for (const hostNodeId of [
					...input.behaviorHostIdsForAncestors(element),
					eventRecord.hostNodeId,
				]) {
					const activation = input.activateBehaviorsFromTrigger(hostNodeId);
					if (activation) await activation;
				}
				await settleWriteObservers();
				// Which rendered row this record belongs to. A bound symbol's id names
				// only the component edge, so without this the handler for row B would
				// spell the same node as the handler for row A - the write lands
				// nowhere, or worse, on the wrong row.
				return { rowScope: marklessRecordRowScope(eventRecord.hostNodeId, input.graph) };
			},
		);
	}
	async function dispatchRowEvent(
		element: ResumeDomElement,
		match: ResumeRowEventMatch,
		event: ResumeDomEvent,
		options: ResumeDispatchOptions,
		stopsImmediately?: () => boolean,
	): Promise<void> {
		const beforeExecution = marklessExecutionLogSnapshot();
		const repeats = await import('./resume-keyed-repeats-lazy.ts');
		const { repeat, rowKey, rowEvent } = match;
		const item = () => repeats.findRepeatItemByKey(input.graph, repeat, rowKey);
		// The row is out of the document AND its item is out of the collection, so
		// this record has no item left to act on. The walk carries on, so an
		// enclosing record still answers the gesture rather than it being dropped.
		if (!match.rowRoot.parentElement && item() === undefined) return;
		await runRecordSymbols(
			element,
			rowEvent,
			repeat.parentHostNodeId,
			event,
			options,
			describeResumeEventTarget(element),
			beforeExecution,
			stopsImmediately,
			async () => {
				await settleWriteObservers();
				repeats.validateOneRepeat(input.graph, repeat);
				// A nested row's instance also names the items of the rows enclosing it.
				return {
					locals: {
						...(repeat as { readonly locals?: () => object }).locals?.(),
						[repeat.itemName]: item(),
					},
				};
			},
		);
	}
	// What the graph's write observers are already loading. A handler's write
	// is answered synchronously only by an observer whose module has arrived,
	// so a gesture that got here first would read its own write stale.
	async function settleWriteObservers(): Promise<void> {
		const settling = input.graph.settleWriteObservers?.();
		if (settling) await settling;
	}
	// A view record and a row record run one listener list the same way; only what
	// is prepared before the first symbol, and which host reports a failure, differ.
	async function runRecordSymbols(
		element: ResumeDomElement,
		record: ResumeEventRecord | ResumeKeyedRepeatRowEvent,
		hostNodeId: string,
		event: ResumeDomEvent,
		options: ResumeDispatchOptions,
		selector: string,
		beforeExecution: Set<string> | undefined,
		stopsImmediately: (() => boolean) | undefined,
		prepare: () => Promise<{
			readonly rowScope?: MarklessRowScope | undefined;
			readonly locals?: Record<string, unknown>;
		}>,
	): Promise<void> {
		if (record.syncPolicy && !options.syncPolicyAlreadyApplied)
			runPolicy?.(record.syncPolicy, input.graph, event);
		let activeSymbolId: string | undefined;
		const report = (error: unknown, symbolId: string | undefined) =>
			input.reportRuntimeError(error, {
				phase: 'event',
				hostNodeId,
				eventName: record.eventName,
				symbolId,
				event,
				element,
			});
		// Opened before the try: beginning the window cannot throw, and the finally
		// that closes it then needs no guard.
		const focusCommit = marklessBeginFocusCommit(input.graph.hasPendingFlush);
		try {
			await input.prepareRuntimeShared();
			const { rowScope, locals } = await prepare();
			// A widget rooted inside this row files its handles under the row, which only the row-scoped qualifier reaches.
			const runSymbol = async (symbolId: string, context: DispatchSymbolContext) =>
				(await input.loadSymbol(symbolId))({
					...context,
					...(rowScope && isBoundSymbolId(symbolId)
						? rowScopedSymbolContext(context, rowScope)
						: {}),
					invokeCallback,
					invokeSymbol,
				});
			// A symbol reached through a callback slot runs inside a dispatching
			// body no caller awaits, so its failure is reported here rather than
			// escaping the dispatch as an unhandled rejection.
			const invokeSymbol = async (symbolId: string, context: ResumeSymbolContext) => {
				try {
					// The callback channel belongs to this dispatch, so a context that
					// arrived without one runs on the dispatch's own graph.
					return await runSymbol(symbolId, {
						...context,
						graph: context.graph ?? input.graph,
					});
				} catch (error) {
					await report(error, symbolId);
					return undefined;
				}
			};
			const baseContext = {
				graph: input.graph,
				event,
				element,
				getElementHandle: readHandle,
				...(locals ? { locals } : {}),
			} as DispatchSymbolContext;
			const invokeCallback = (symbolId: string, args: ReadonlyArray<unknown>) =>
				invokeSymbol(symbolId, { ...baseContext, args, invokeCallback, invokeSymbol });
			for (const symbolId of record.symbolIds) {
				activeSymbolId = symbolId;
				await runSymbol(symbolId, baseContext);
				// One element's handlers are one listener list: a handler that calls
				// stopImmediatePropagation ends it here, before the next one runs. The
				// stopping entry's own writes still commit - the `finally` flushes them.
				if (stopsImmediately?.()) return;
			}
		} catch (error) {
			await report(error, activeSymbolId);
			throw error;
		} finally {
			await input.flushRuntimeGraph();
			marklessEndFocusCommit(focusCommit);
			await marklessLogInteraction({
				eventName: event.type,
				eventRecord: record,
				before: beforeExecution,
				view: input.view,
				selector,
				dispatchModuleId: 'web:resume-events',
			});
		}
	}
	return {
		eventRecords,
		rowEventRecords,
		addEventRecord,
		addRowEvent,
		armFocusPreload,
		preloadFocusKeySymbols,
		releaseFocusPreload,
		prepareSyncPolicy,
		...(typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? { whenDebugRegistered: () => Promise.all(debugRegistrations ?? []) }
			: {}),
		dispatch,
	};
}

// Only a bound symbol needs the row threaded in: every other id reaches its
// instance through the path it already carries, which the loader boundary
// consumes. A nested compose may have prefixed the bound id, so the reading is
// taken past any instance path.
function isBoundSymbolId(symbolId: string): boolean {
	return symbolId.slice(marklessInstancePath(symbolId).length).startsWith('bound:');
}

function rowScopedSymbolContext(
	context: DispatchSymbolContext,
	rowScope: MarklessRowScope,
): Pick<DispatchSymbolContext, 'graph'> & Partial<Pick<DispatchSymbolContext, 'getElementHandle'>> {
	const graph = marklessRowScopedGraph(context.graph, rowScope) as MarklessScopedGraph;
	const qualify = graph.marklessQualifyGraphNodeId;
	const read = context.getElementHandle;
	if (!qualify || typeof read !== 'function') return { graph };
	return { graph, getElementHandle: (handleIdOrName) => read(qualify(handleIdOrName)) };
}

function recordDebugInteraction(root: Element, element: Element, eventName: string, record: any) {
	const rootRef = new WeakRef(root),
		elementRef = new WeakRef(element);
	return import('./debug-channel.ts')
		.then((debug) => {
			const liveRoot = rootRef.deref(),
				liveElement = elementRef.deref();
			if (liveRoot && liveElement)
				debug.__marklessDebugRecordInteraction(liveRoot, liveElement, eventName, record);
		})
		.catch(() => {});
}

function marklessExecutionLogSnapshot(): Set<string> | undefined {
	const log = (globalThis as ExecutionLogGlobal).__mxLog;
	return log ? new Set(log) : undefined;
}
function describeResumeEventTarget(target: ResumeDomElement): string {
	const tag = typeof target.tagName === 'string' ? target.tagName.toLowerCase() : 'element';
	const id = typeof target.id === 'string' && target.id ? `#${target.id}` : '';
	return `${tag}${id}`;
}

async function marklessLogInteraction(input: {
	readonly eventName: string;
	readonly eventRecord?: ResumeEventRecord | ResumeKeyedRepeatRowEvent | null;
	readonly before?: ReadonlySet<string>;
	readonly view: ResumeRuntimeInput['view'];
	readonly selector?: string;
	readonly dispatchModuleId?: string;
	readonly noMatch?: boolean;
}): Promise<void> {
	const global = globalThis as ExecutionLogGlobal;
	if (!global.__mxLog) return;
	try {
		await (
			global.__mxLogInteraction ?? (await global.__mxLoadLog?.())?.logMarklessInteraction
		)?.({ ...input, after: new Set(global.__mxLog) });
	} catch {
		// Execution logging is observability only; app dispatch must not depend on it.
	}
}

type ResumeDispatchMatch =
	| { readonly element: ResumeDomElement; readonly rowMatch: ResumeRowEventMatch }
	| { readonly element: ResumeDomElement; readonly eventRecord: ResumeEventRecord };

// The DOM runs every listener on the target-to-root chain, innermost first, each
// on the element it was declared on. A nested widget root and the widget that
// encloses it both answer for the same key, so the walk collects the whole path
// rather than the first record it finds. One record per element, row before
// view, is the precedence this match already had.
//
// A non-bubbling event is the exception the DOM itself makes: only the target's
// own listeners run. Dispatch reaches this walk from a capture listener on the
// container, which sees such an event too, so the walk has to make the same cut
// or `focus`, `blur`, and the runtime's own `dismiss` would run on every
// ancestor that declared the same handler.
function collectDispatchPath(
	target: ResumeDomElement,
	eventName: string,
	eventRecords: WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>,
	rowEventRecords: ResumeRowEventRecords,
	bubbles = true,
): ResumeDispatchMatch[] {
	const path: ResumeDispatchMatch[] = [];
	let current: ResumeDomElement | null | undefined = target;
	while (current) {
		const rowMatch = rowEventRecords.get(current)?.get(eventName);
		if (rowMatch) path.push({ element: current, rowMatch });
		else {
			const eventRecord = eventRecords.get(current)?.get(eventName);
			if (eventRecord) path.push({ element: current, eventRecord });
		}
		// A detached row root has no parent left, so the walk crosses on the parent
		// it was removed from - the same link the DOM would have handed it had the
		// removal not beaten this dispatch to it.
		current = bubbles
			? (current.parentElement ?? (current as DisposedRepeatRow).__marklessRowParent ?? null)
			: null;
	}
	return path;
}

// Dispatch runs from one capture listener on the container root, so the DOM's
// own propagation flags never see this synthetic walk: a handler's
// stopPropagation call has to be observed here.
// stopImmediatePropagation is read separately: one element's record carries an
// ordered symbolIds list, so there IS a same-element listener left for it to
// drop that stopPropagation alone would not stop. Row hosts and view hosts read
// the same flag.
function trackPropagationStops(
	event: ResumeDomEvent,
	initiallyStopped = false,
): {
	readonly stopped: () => boolean;
	readonly stoppedImmediate: () => boolean;
	readonly release: () => void;
} {
	const host = event as unknown as Record<string, unknown>;
	// Native dispatch can clear cancelBubble before the lazy handoff resumes.
	let stopped = initiallyStopped || host.cancelBubble === true;
	// stopImmediatePropagation is the DOM's own answer for several listeners on
	// ONE element, which is what a handler array and a merged spread handler are:
	// the rest of this element's list is skipped, not only the ancestors'.
	let immediate = false;
	const restore: Array<() => void> = [];
	let patched = false;
	const patch = (name: string, mark: () => void): void => {
		const own = Object.prototype.hasOwnProperty.call(host, name);
		const native = host[name];
		try {
			host[name] = (...args: unknown[]) => {
				mark();
				return typeof native === 'function'
					? (native as (...call: unknown[]) => unknown).apply(event, args)
					: undefined;
			};
		} catch {
			// A frozen event still reports through cancelBubble.
			return;
		}
		patched = true;
		restore.push(() => {
			if (own) host[name] = native;
			else delete host[name];
		});
	};
	patch('stopPropagation', () => {
		stopped = true;
	});
	patch('stopImmediatePropagation', () => {
		stopped = true;
		immediate = true;
	});
	return {
		stopped: () => stopped || (!patched && host.cancelBubble === true),
		stoppedImmediate: () => immediate,
		release: () => {
			for (const undo of restore) undo();
		},
	};
}
// Keep locator materialization outside the dispatch module's eager imports.
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	if (root.contains) return root.contains(target);
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
function unmatchedDispatchError(event: ResumeDomEvent, selector: string | undefined): Error {
	return marklessCodedError(
		'RuntimeResumeError',
		'MARKLESS_EVENT_DISPATCH_UNMATCHED',
		`No event record matched ${event.type} dispatch${selector ? ` at ${selector}` : ''}.`,
		{
			phase: 'event',
			eventName: event.type,
			selector,
			dispatchModuleId: 'web:resume-events',
		},
	);
}
