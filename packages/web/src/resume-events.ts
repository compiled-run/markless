import type { RuntimeGraph } from '@markless/runtime';
import { protocolEventDispatchesMarkless } from '@markless/serializer/protocol';
import {
	marklessInstancePath,
	marklessRecordRowScope,
	marklessRowScopedGraph,
} from './fns/instance-scope.ts';
import type {
	ElementHandleRegistry,
	ResumeDispatchOptions,
	ResumeDomElement,
	ResumeDomEvent,
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
	readonly registerDelegatedEventRecord?: ResumeRuntimeInput['registerDelegatedEventRecord'];
}) {
	const eventRecords = new WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>();
	const rowEventRecords: ResumeRowEventRecords = new WeakMap();
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
		if (held && held !== record && added.length > 0) {
			byName.set(record.eventName, {
				...held,
				...(held.syncPolicy ? {} : record.syncPolicy ? { syncPolicy: record.syncPolicy } : {}),
				symbolIds: [...held.symbolIds, ...added],
			});
			input.eventTypes.add(record.eventName);
			input.registerDelegatedEventRecord?.(element, record);
			return;
		}
		byName.set(record.eventName, record);
		input.eventTypes.add(record.eventName);
		input.registerDelegatedEventRecord?.(element, record);
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
	const addRowEvent = (host: ResumeDomElement, match: ResumeRowEventMatch) => {
		let byName = rowEventRecords.get(host);
		if (!byName) {
			byName = new Map();
			rowEventRecords.set(host, byName);
		}
		byName.set(match.rowEvent.eventName, match);
		input.eventTypes.add(match.rowEvent.eventName);
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
		runPolicy = (await import('./inline/sync-policy-core.ts')).runSyncPolicyActions as never;
	}
	async function dispatch(
		event: ResumeDomEvent,
		options: ResumeDispatchOptions = {},
	): Promise<void> {
		const target = event.target;
		if (!target) throw unmatchedDispatchError(event, undefined);
		const selector = describeResumeEventTarget(target);
		const ignoredDisposed = input.ignoredDisposedEventTargets.has(target);
		if (!containsElement(input.root, target) && !ignoredDisposed)
			throw unmatchedDispatchError(event, selector);
		const path = collectDispatchPath(
			target,
			event.type,
			eventRecords,
			rowEventRecords,
			event.bubbles !== false,
		);
		if (path.length === 0) {
			if (ignoredDisposed) return;
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
			throw unmatchedDispatchError(event, selector);
		}
		const propagation = trackPropagationStops(event);
		let stopAfterElement: ResumeDomElement | undefined;
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
		const beforeExecution = marklessExecutionLogSnapshot();
		if (eventRecord.syncPolicy && !options.syncPolicyAlreadyApplied)
			runPolicy?.(eventRecord.syncPolicy, input.graph, event);
		let activeSymbolId: string | undefined;
		try {
			await input.prepareRuntimeShared();
			for (const hostNodeId of input.behaviorHostIdsForAncestors(element)) {
				const activation = input.activateBehaviorsFromTrigger(hostNodeId);
				if (activation) await activation;
			}
			const activation = input.activateBehaviorsFromTrigger(eventRecord.hostNodeId);
			if (activation) await activation;
			// Which rendered row this record belongs to. A bound symbol's id names
			// only the component edge, so without this the handler for row B would
			// spell the same node as the handler for row A - the write lands
			// nowhere, or worse, on the wrong row.
			const rowScope = marklessRecordRowScope(eventRecord.hostNodeId, input.graph);
			// Element handles need no answer here. A bound symbol's own resolver
			// spells them against the bound edge's instance path, exactly as it
			// already spells that symbol's graph nodes, so the widget a handle read
			// belongs to is decided by the same fact for both halves. Reading it off
			// this record's host instead only ever answered when the dispatching part
			// happened to bind a handle of its own.
			const runSymbol = async (symbolId: string, context: DispatchSymbolContext) =>
				(await input.loadSymbol(symbolId))({
					...context,
					...(rowScope && isBoundSymbolId(symbolId)
						? { graph: marklessRowScopedGraph(context.graph, rowScope) }
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
					return await runSymbol(symbolId, { ...context, graph: context.graph ?? input.graph });
				} catch (error) {
					await input.reportRuntimeError(error, {
						phase: 'event',
						hostNodeId: eventRecord.hostNodeId,
						eventName: eventRecord.eventName,
						symbolId,
						event,
						element,
					});
					return undefined;
				}
			};
			const baseContext = {
				graph: input.graph,
				event,
				element,
				getElementHandle: input.elementHandles.get,
			} as DispatchSymbolContext;
			const invokeCallback = (symbolId: string, args: ReadonlyArray<unknown>) =>
				invokeSymbol(symbolId, { ...baseContext, args, invokeCallback, invokeSymbol });
			for (const symbolId of eventRecord.symbolIds) {
				activeSymbolId = symbolId;
				await runSymbol(symbolId, baseContext);
				// One element's handlers are one listener list: a handler that calls
				// stopImmediatePropagation ends it here, before the next one runs.
				if (stopsImmediately?.()) return;
			}
		} catch (error) {
			await input.reportRuntimeError(error, {
				phase: 'event',
				hostNodeId: eventRecord.hostNodeId,
				eventName: eventRecord.eventName,
				symbolId: activeSymbolId,
				event,
				element,
			});
			throw error;
		} finally {
			await input.flushRuntimeGraph();
			await marklessLogInteraction({
				eventName: event.type,
				eventRecord,
				before: beforeExecution,
				view: input.view,
				selector,
				dispatchModuleId: 'web:resume-events',
			});
		}
	}
	async function dispatchRowEvent(
		element: ResumeDomElement,
		match: ResumeRowEventMatch,
		event: ResumeDomEvent,
		options: ResumeDispatchOptions,
		stopsImmediately?: () => boolean,
	): Promise<void> {
		const beforeExecution = marklessExecutionLogSnapshot();
		const { findRepeatItemByKey, readKeyedRepeatCollection, validateOneRepeat } =
			await import('./resume-keyed-repeats.ts');
		const { repeat, rowKey, rowEvent } = match;
		if (rowEvent.syncPolicy && !options.syncPolicyAlreadyApplied)
			runPolicy?.(rowEvent.syncPolicy, input.graph, event);
		let activeSymbolId: string | undefined;
		try {
			await input.prepareRuntimeShared();
			validateOneRepeat(input.graph, repeat);
			const locals = {
				[repeat.itemName]: findRepeatItemByKey(
					readKeyedRepeatCollection(input.graph, repeat),
					repeat,
					rowKey,
				),
			};
			// A row's symbol dispatches through the same callback channel a view
			// event's does; the row's own item locals travel with it.
			const runSymbol = async (symbolId: string, context: DispatchSymbolContext) =>
				(await input.loadSymbol(symbolId))({ ...context, invokeCallback, invokeSymbol });
			const invokeSymbol = async (symbolId: string, context: ResumeSymbolContext) => {
				try {
					// The callback channel belongs to this dispatch, so a context that
					// arrived without one runs on the dispatch's own graph.
					return await runSymbol(symbolId, { ...context, graph: context.graph ?? input.graph });
				} catch (error) {
					await input.reportRuntimeError(error, {
						phase: 'event',
						hostNodeId: repeat.parentHostNodeId,
						eventName: rowEvent.eventName,
						symbolId,
						event,
						element,
					});
					return undefined;
				}
			};
			const baseContext = {
				graph: input.graph,
				event,
				element,
				getElementHandle: input.elementHandles.get,
				locals,
			} as DispatchSymbolContext;
			const invokeCallback = (symbolId: string, args: ReadonlyArray<unknown>) =>
				invokeSymbol(symbolId, { ...baseContext, args, invokeCallback, invokeSymbol });
			for (const symbolId of rowEvent.symbolIds) {
				activeSymbolId = symbolId;
				await runSymbol(symbolId, baseContext);
				// A row host's entries are one listener list too: the entry that calls
				// stopImmediatePropagation is the last one to run. The stopping entry's
				// own writes still commit - the `finally` below flushes them.
				if (stopsImmediately?.()) return;
			}
		} catch (error) {
			await input.reportRuntimeError(error, {
				phase: 'event',
				hostNodeId: repeat.parentHostNodeId,
				eventName: rowEvent.eventName,
				symbolId: activeSymbolId,
				event,
				element,
			});
			throw error;
		} finally {
			await input.flushRuntimeGraph();
			await marklessLogInteraction({
				eventName: event.type,
				eventRecord: rowEvent,
				before: beforeExecution,
				view: input.view,
				selector: describeResumeEventTarget(element),
				dispatchModuleId: 'web:resume-events',
			});
		}
	}
	return {
		eventRecords,
		rowEventRecords,
		addEventRecord,
		addRowEvent,
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
	if (global.__mxLogInteraction) {
		await global.__mxLogInteraction({ ...input, after: new Set(global.__mxLog) });
		return;
	}
	try {
		const log = await global.__mxLoadLog?.();
		await log?.logMarklessInteraction?.({ ...input, after: new Set(global.__mxLog) });
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
		current = bubbles ? current.parentElement : null;
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
function trackPropagationStops(event: ResumeDomEvent): {
	readonly stopped: () => boolean;
	readonly stoppedImmediate: () => boolean;
	readonly release: () => void;
} {
	const host = event as unknown as Record<string, unknown>;
	// An entry capture may have applied the innermost record's stopPropagation
	// policy before this walk started; the DOM flag is the only trace it leaves.
	let stopped = host.cancelBubble === true;
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
// Local copy of the resume-locators containsElement: importing that module
// here regroups the wall-counted chunk graph, which costs more than the
// duplication saves (T120 measurement; re-confirmed on this tree).
function containsElement(root: ResumeDomElement, target: ResumeDomElement): boolean {
	if (root === target) return true;
	for (const child of root.childNodes ?? [])
		if (child.nodeType === 1 && containsElement(child as ResumeDomElement, target)) return true;
	return false;
}
function unmatchedDispatchError(event: ResumeDomEvent, selector: string | undefined): Error {
	const code = 'MARKLESS_EVENT_DISPATCH_UNMATCHED';
	const error = new Error(
		`${code}: No event record matched ${event.type} dispatch${selector ? ` at ${selector}` : ''}.`,
	) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = code;
	error.phase = 'event';
	error.eventName = event.type;
	error.selector = selector;
	error.dispatchModuleId = 'web:resume-events';
	error.docsUrl = `https://markless.dev/errors/${code}`;
	return error;
}
