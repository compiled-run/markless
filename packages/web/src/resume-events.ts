import type { RuntimeGraph } from '@markless/runtime';
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
		byName.set(record.eventName, record);
		input.eventTypes.add(record.eventName);
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
		const beforeExecution = marklessExecutionLogSnapshot();
		const target = event.target;
		if (!target) throw unmatchedDispatchError(event, undefined);
		const selector = describeResumeEventTarget(target);
		if (
			!containsElement(input.root, target) &&
			!ignoredDisposedTarget(input.ignoredDisposedEventTargets, target)
		)
			throw unmatchedDispatchError(event, selector);
		const matched = findDispatchMatch(target, event.type, eventRecords, rowEventRecords);
		if (!matched) {
			if (ignoredDisposedTarget(input.ignoredDisposedEventTargets, target)) return;
			await marklessLogInteraction({
				eventName: event.type,
				eventRecord: null,
				before: beforeExecution,
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
		if ('rowMatch' in matched)
			return dispatchRowEvent(matched.element, matched.rowMatch, event, options);
		const { element, eventRecord } = matched;
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
			const invokeSymbol = async (symbolId: string, context: ResumeSymbolContext) => {
				const symbol = await input.loadSymbol(symbolId);
				const result = symbol({ ...context, invokeCallback, invokeSymbol });
				return isPromiseLike(result) ? await result : result;
			};
			const baseContext = {
				graph: input.graph,
				event,
				element,
				getElementHandle: input.elementHandles.get,
			} as ResumeSymbolContext;
			const invokeCallback = (symbolId: string, args: ReadonlyArray<unknown>) =>
				invokeSymbol(symbolId, { ...baseContext, args, invokeCallback, invokeSymbol });
			for (const symbolId of eventRecord.symbolIds) {
				activeSymbolId = symbolId;
				await invokeSymbol(symbolId, baseContext);
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
			for (const symbolId of rowEvent.symbolIds) {
				activeSymbolId = symbolId;
				const symbol = await input.loadSymbol(symbolId);
				const result = symbol({
					graph: input.graph,
					event,
					element,
					getElementHandle: input.elementHandles.get,
					locals,
				});
				if (isPromiseLike(result)) await result;
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
	const id =
		typeof (target as { readonly id?: unknown }).id === 'string' &&
		(target as { readonly id?: string }).id
			? `#${(target as { readonly id: string }).id}`
			: '';
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

function findDispatchMatch(
	target: ResumeDomElement,
	eventName: string,
	eventRecords: WeakMap<ResumeDomElement, Map<string, ResumeEventRecord>>,
	rowEventRecords: ResumeRowEventRecords,
) {
	let current: ResumeDomElement | null | undefined = target;
	while (current) {
		const rowMatch = rowEventRecords.get(current)?.get(eventName);
		if (rowMatch) return { element: current, rowMatch };
		const eventRecord = eventRecords.get(current)?.get(eventName);
		if (eventRecord) return { element: current, eventRecord };
		current = current.parentElement;
	}
	return null;
}
function ignoredDisposedTarget(
	disposedTargets: WeakSet<ResumeDomElement>,
	target: ResumeDomElement,
): boolean {
	return disposedTargets.has(target);
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
	const error = new Error(
		`MARKLESS_EVENT_DISPATCH_UNMATCHED: No event record matched ${event.type} dispatch${selector ? ` at ${selector}` : ''}.`,
	) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = 'MARKLESS_EVENT_DISPATCH_UNMATCHED';
	error.phase = 'event';
	error.eventName = event.type;
	error.selector = selector;
	error.dispatchModuleId = 'web:resume-events';
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_EVENT_DISPATCH_UNMATCHED';
	return error;
}
function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}
