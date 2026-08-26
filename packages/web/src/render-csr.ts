import {
	PROTOCOL_EVENT_ACTION_KIND,
	protocolEventActionKind,
	type ProtocolEventActionKind,
	type ProtocolEventRecord,
	type ProtocolStatePayload,
	type ProtocolViewPayload,
} from '@markless/serializer/protocol';
import type { DomJournalEntry } from '@markless/runtime';
import type { RuntimeGraph } from '@markless/runtime';
import { marklessAttributeValue } from './dom-attribute.ts';
import type { CsrRenderContainer, CsrRenderOptions, CsrRenderOutput } from './render.ts';
import { marklessInstanceScopedLoadSymbol } from './fns/instance-scope.ts';
import {
	runSyncPolicyActions,
	type SyncPolicyDomEvent,
	type SyncPolicyGraph,
} from './inline/sync-policy-core.ts';
import { registerServedArmEventRecords } from './resume-arm-records.ts';
import type {
	ResumeAsyncBoundaryPayload,
	ResumeDispatchOptions,
	ResumeDomElement,
} from './resume-types.ts';
import type { ResumeRuntime, ResumeRuntimeInput, ResumeSymbol } from './resume.ts';
import { reportRuntimeErrorToHost } from './runtime-error-reporting.ts';

declare const __MARKLESS_DEV_ENABLED__: boolean;

type ExecutionLogGlobal = typeof globalThis & {
	__mxLog?: Set<string>;
	__mxLoadLog?: () => Promise<{
		readonly logMarklessRenderSummary?: (input?: unknown) => unknown;
	}>;
};

export async function renderCsrRuntime(input: {
	readonly output: CsrRenderOutput;
	readonly options: CsrRenderOptions;
}): Promise<CsrRenderContainer> {
	const { output, options } = input;
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
		void import('./debug-channel.ts')
			.then((debug) =>
				debug.__marklessDebugStartContainer(
					output.root as unknown as Element,
					'csr',
					false,
				),
			)
			.catch(() => {});
	// Keep the graph and full runtime demand-loaded until interaction.
	const state = output.state ?? emptyStatePayload();
	const view = output.view ?? emptyViewPayload();
	const loadSymbol = withCsrCallbackSymbols(
		marklessInstanceScopedLoadSymbol(
			output.loadSymbol ?? options.loadSymbol ?? missingLoadSymbol,
		),
		view,
	);

	let graph: RuntimeGraph | undefined;
	let runtime: ResumeRuntime | undefined;
	let starting: Promise<ResumeRuntime> | undefined;
	let disposed = false;
	type CsrDispatch = (
		event: NonNullable<Parameters<ResumeRuntime['dispatch']>[0]>,
		options?: Parameters<ResumeRuntime['dispatch']>[1],
	) => Promise<void>;
	let dispatchHandler: CsrDispatch;
	let dispatchTail = Promise.resolve();
	const dispatchQueued: CsrDispatch = (event, dispatchOptions) => {
		// A queued dispatch can reach its turn after teardown; the container it
		// was aimed at is gone, so it has nothing left to run.
		const dispatch = async () =>
			disposed ? undefined : dispatchHandler(event, dispatchOptions);
		const next = dispatchTail.then(dispatch, dispatch);
		dispatchTail = next.catch(() => {});
		return next;
	};
	const cleanup = await activateAuthoredBehaviors(
		output,
		view,
		output.loadBehaviorSymbol ?? loadSymbol,
	);
	const demandRuntime = async (): Promise<ResumeRuntime> => {
		if (runtime) return runtime;
		if (!starting)
			starting = (async () => {
				graph =
					output.graph ??
					(await createFullRuntimeGraph({
						state,
						view,
						root: output.root,
						loadSymbol,
						hasAuthoredState: !!output.state,
					}));
				const { createResumeRuntime } = await import('./resume.ts');
				const runtimeView = {
					...view,
					behaviors: [],
				};
				const applyDomJournal =
					options.applyDomJournal ??
					((entries: ReadonlyArray<DomJournalEntry>) =>
						applyDefaultCsrDomJournal(entries, runtime!));
				runtime = createResumeRuntime({
					root: output.root,
					graph,
					state,
					view: runtimeView,
					liveHostNodes: output.liveHostNodes,
					loadSymbol,
					createVisibilityObserver: options.createVisibilityObserver,
					createRemovalObserver: options.createRemovalObserver,
					applyDomJournal,
					renderBranchHtml: options.renderBranchHtml ?? globalDocumentBranchHtml(),
					demandAsyncBoundaries: true,
					registerDelegatedEventRecord: delegatedTriggers.registerEventRecord,
					renderData: output.renderData,
				});
				await runtime.start();
				dispatchHandler = (event, dispatchOptions) =>
					runtime!.dispatch(event, dispatchOptions);
				if (disposed) runtime.dispose();
				return runtime;
			})();
		return starting;
	};
	dispatchHandler = async (event, dispatchOptions) =>
		(await demandRuntime()).dispatch(event, dispatchOptions);
	const deferredRuntime: ResumeRuntime = {
		start: async () => void (await demandRuntime()),
		async dispatch(event, dispatchOptions) {
			if (!event) return;
			await dispatchQueued(event, dispatchOptions);
		},
		async activateBehaviors(hostNodeId) {
			await (await demandRuntime()).activateBehaviors(hostNodeId);
		},
		getElement(hostNodeId) {
			return runtime?.getElement(hostNodeId) ?? output.liveHostNodes?.get(hostNodeId);
		},
		getAsyncBoundary(boundaryId) {
			return runtime?.getAsyncBoundary(boundaryId);
		},
		getBranch(branchId) {
			return runtime?.getBranch(branchId);
		},
		disposeHost(hostNodeId) {
			runtime?.disposeHost(hostNodeId);
		},
		dispose() {
			disposed = true;
			delegatedTriggers.dispose();
			for (const release of cleanup.splice(0).reverse()) release();
			runtime?.dispose();
		},
		whenAsyncBoundariesSettled: async () =>
			(await demandRuntime()).whenAsyncBoundariesSettled?.(),
		holdPendingSettleCommits: async (ms) =>
			(await demandRuntime()).holdPendingSettleCommits?.(ms),
	};
	const delegatedTriggers = installDelegatedTriggers(
		output,
		view,
		dispatchQueued,
		{
			// The graph is demand-loaded, so a policy read before the first dispatch
			// answers off the values the mount seeded its cells with.
			read: (graphNodeId, path) =>
				graph
					? graph.read(graphNodeId, path)
					: readSeededStateValue(state, graphNodeId, path),
		},
		loadSymbol,
	);
	registerServedArmEventRecords(
		output.root as unknown as ResumeDomElement,
		view.asyncBoundaries as ReadonlyArray<ResumeAsyncBoundaryPayload>,
		delegatedTriggers.registerEventRecord,
		(view.branches ?? []) as ReadonlyArray<{
			readonly startAnchor: ResumeAsyncBoundaryPayload['startAnchor'];
			readonly endAnchor: ResumeAsyncBoundaryPayload['endAnchor'];
			readonly servedArmRecords?: unknown;
		}>,
	);
	if (typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__)
		await registerDelegatedTriggerDebug(output, view);
	if ((globalThis as ExecutionLogGlobal).__mxLog) await marklessLogCsrSummary();
	return Object.defineProperty(
		{
			phase: 'csr' as const,
			root: output.root,
			runtime: deferredRuntime,
		},
		'graph',
		{
			enumerable: true,
			get() {
				if (!graph) throw new Error('MARKLESS_CSR_GRAPH_NOT_DEMANDED');
				return graph;
			},
		},
	) as CsrRenderContainer;
}

async function registerDelegatedTriggerDebug(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
): Promise<void> {
	const debug = await import('./debug-channel.ts');
	debug.__marklessDebugStartContainer(output.root as unknown as Element, 'csr', false);
	for (const record of view.events) {
		if (record.eventName === 'visible') continue;
		const element =
			output.liveHostNodes?.get(record.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === record.hostNodeId
				? output.root
				: undefined);
		if (!element) continue;
		debug.__marklessDebugRecordInteraction(
			output.root as unknown as Element,
			element as unknown as Element,
			record.eventName,
			{
				kind: 'delegated-csr',
				source: 'chunk-event',
				hostNodeId: record.hostNodeId,
				symbolIds: record.symbolIds ?? [],
			},
		);
	}
}

async function marklessLogCsrSummary(): Promise<void> {
	const global = globalThis as ExecutionLogGlobal;
	try {
		const log = await global.__mxLoadLog?.();
		await log?.logMarklessRenderSummary?.();
	} catch {
		// Execution logging is observability only; render must not depend on it.
	}
}

async function activateAuthoredBehaviors(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
	loadSymbol: ResumeRuntimeInput['loadSymbol'],
): Promise<Array<() => void>> {
	const cleanup: Array<() => void> = [];
	for (const behavior of view.behaviors) {
		if (!behavior.symbolId) continue;
		const element =
			output.liveHostNodes?.get(behavior.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === behavior.hostNodeId
				? output.root
				: undefined);
		if (!element) throw new Error(`MARKLESS_CSR_BEHAVIOR_HOST_MISSING: ${behavior.hostNodeId}`);
		const symbol = await loadSymbol(behavior.symbolId);
		const result = await symbol({
			element,
			getElementHandle: () => undefined,
			behaviorInputs: behavior.inputValues ?? [],
		});
		if (typeof result === 'function') cleanup.push(result);
	}
	return cleanup;
}

// Focus reaches an element before any key event can, so a record naming one of
// these is a handler the page is about to need. Restated here rather than
// shared: a module of its own is a chunk on the resume path's dispatch census.
const FOCUS_KEY_EVENT_NAMES = ['keydown', 'keyup', 'keypress'];
const FOCUS_EDITABLE_EVENT_NAMES = ['beforeinput', 'input'];
// A pointer crosses onto a control before it presses it, and Safari focuses no
// button on click - so hover, not focus, is what reliably precedes a first press.
const PRESS_EVENT_NAMES = ['click', 'pointerdown', 'pointerup'];

function focusPreloadEventNames(element: {
	readonly tagName?: unknown;
	readonly isContentEditable?: unknown;
}): ReadonlyArray<string> {
	const tagName = typeof element.tagName === 'string' ? element.tagName.toUpperCase() : '';
	return element.isContentEditable === true ||
		tagName === 'INPUT' ||
		tagName === 'TEXTAREA' ||
		tagName === 'SELECT'
		? [...FOCUS_KEY_EVENT_NAMES, ...FOCUS_EDITABLE_EVENT_NAMES]
		: FOCUS_KEY_EVENT_NAMES;
}

function isFocusPreloadEventName(eventName: string): boolean {
	return (
		FOCUS_KEY_EVENT_NAMES.includes(eventName) || FOCUS_EDITABLE_EVENT_NAMES.includes(eventName)
	);
}

function installDelegatedTriggers(
	output: CsrRenderOutput,
	view: ProtocolViewPayload,
	dispatch: (
		event: NonNullable<Parameters<ResumeRuntime['dispatch']>[0]>,
		dispatchOptions?: ResumeDispatchOptions,
	) => Promise<void>,
	syncPolicyGraph: SyncPolicyGraph,
	loadSymbol: ResumeRuntimeInput['loadSymbol'],
): {
	readonly registerEventRecord: (element: object, record: ProtocolEventRecord) => void;
	readonly dispose: () => void;
} {
	// One capture listener remains the container's dispatch authority.
	output.root.__marklessDelegatedDispatch = true;
	const recordsByElement = new Map<object, Map<string, ProtocolEventRecord>>();
	const rowEventNames = new Set(
		(view.keyedRepeats ?? []).flatMap((repeat) =>
			repeat.rowEvents.map((event) => event.eventName),
		),
	);
	const releases: Array<() => void> = [];
	const installedEventNames = new Set<string>();
	type DelegatedEvent = NonNullable<Parameters<ResumeRuntime['dispatch']>[0]>;
	type DelegatedRoute = (
		event: DelegatedEvent,
		dispatchOptions?: ResumeDispatchOptions,
	) => Promise<void>;
	const routes: Partial<Record<string, DelegatedRoute>> = {
		[PROTOCOL_EVENT_ACTION_KIND.event]: dispatch,
		[PROTOCOL_EVENT_ACTION_KIND.externalDelegate]: async () => {},
	} satisfies Record<ProtocolEventActionKind, DelegatedRoute>;
	const installEventListener = (eventName: string) => {
		if (eventName === 'visible' || installedEventNames.has(eventName)) return;
		installedEventNames.add(eventName);
		const route = async (event: DelegatedEvent) => {
			// A row event name is listened for on behalf of rows that may not exist
			// yet, so this listener takes every event of that name, named or not.
			let named = false;
			let syncPolicyApplied = false;
			let actionKind: ProtocolEventActionKind | undefined = rowEventNames.has(event.type)
				? PROTOCOL_EVENT_ACTION_KIND.event
				: undefined;
			for (
				let element = event.target;
				element && !actionKind;
				element = element.parentElement ?? null
			) {
				const record = recordsByElement.get(element)?.get(event.type);
				if (record) {
					actionKind = protocolEventActionKind(record);
					named = true;
					// The browser reads defaultPrevented when this dispatch returns,
					// and the handler module is still being fetched then.
					if (record.syncPolicy && actionKind === PROTOCOL_EVENT_ACTION_KIND.event) {
						runSyncPolicyActions(
							record.syncPolicy,
							syncPolicyGraph,
							event as unknown as SyncPolicyDomEvent,
						);
						syncPolicyApplied = true;
					}
				}
			}
			// This container listener exists for whichever element registered the
			// record; a sibling with no record of its own is simply not ours.
			if (!actionKind) return;
			const action = routes[actionKind];
			// Fail-closed on a record this runtime cannot route, on the same dev
			// gate this guard has always carried.
			if (!action) {
				if (typeof __MARKLESS_DEV_ENABLED__ === 'undefined' || __MARKLESS_DEV_ENABLED__)
					throw unroutedDelegatedTriggerError(actionKind);
				return;
			}
			await action(
				event,
				named
					? syncPolicyApplied
						? { syncPolicyAlreadyApplied: true }
						: undefined
					: { ignoreUnmatched: true },
			);
		};
		// addEventListener drops the returned promise, so a rejection would escape
		// the flush unhandled: contain it here and report it instead.
		const listener = (event: DelegatedEvent) =>
			route(event).catch((error) =>
				reportRuntimeErrorToHost(error, {
					phase: 'event',
					eventName: event.type,
					selector: delegatedTargetTag(event.target),
				}),
			);
		output.root.addEventListener?.(eventName, listener, { capture: true });
		releases.push(() =>
			output.root.removeEventListener?.(eventName, listener, { capture: true }),
		);
	};
	// Focus lands before any key can, so the focused element's key records name
	// the handler modules this page is about to need. Fetch only; never dispatch.
	const preloadedSymbolIds = new Set<string>();
	const preloadSymbolsFor = (
		target: DelegatedEvent['target'],
		namesFor: (element: NonNullable<DelegatedEvent['target']>) => ReadonlyArray<string>,
	) => {
		for (
			let element: DelegatedEvent['target'] = target;
			element;
			element = element.parentElement ?? null
		) {
			const records = recordsByElement.get(element);
			if (records)
				for (const eventName of namesFor(element)) {
					for (const symbolId of records.get(eventName)?.symbolIds ?? []) {
						if (preloadedSymbolIds.has(symbolId)) continue;
						preloadedSymbolIds.add(symbolId);
						void Promise.resolve(loadSymbol(symbolId)).catch(() => {});
					}
				}
			if ((element as object) === (output.root as object)) break;
		}
	};
	const installedPreloadTriggers = new Set<string>();
	const installPreloadTrigger = (
		triggerName: string,
		namesFor: (element: NonNullable<DelegatedEvent['target']>) => ReadonlyArray<string>,
	) => {
		if (installedPreloadTriggers.has(triggerName)) return;
		installedPreloadTriggers.add(triggerName);
		const listener = (event: DelegatedEvent) => preloadSymbolsFor(event.target, namesFor);
		output.root.addEventListener?.(triggerName, listener, { capture: true });
		releases.push(() =>
			output.root.removeEventListener?.(triggerName, listener, { capture: true }),
		);
	};
	const registerEventRecord = (element: object, record: ProtocolEventRecord) => {
		const records = recordsByElement.get(element) ?? new Map<string, ProtocolEventRecord>();
		if (records.get(record.eventName) === record) return;
		records.set(record.eventName, record);
		recordsByElement.set(element, records);
		installEventListener(record.eventName);
		if (isFocusPreloadEventName(record.eventName))
			installPreloadTrigger('focusin', focusPreloadEventNames);
		// pointerenter does not bubble, so a delegated listener would only ever see
		// the container's own crossing.
		if (PRESS_EVENT_NAMES.includes(record.eventName))
			installPreloadTrigger('pointerover', () => PRESS_EVENT_NAMES);
	};
	for (const record of view.events) {
		if (record.eventName === 'visible') continue;
		const element =
			output.liveHostNodes?.get(record.hostNodeId) ??
			(view.locators.length === 1 && view.locators[0]?.hostNodeId === record.hostNodeId
				? output.root
				: undefined);
		if (!element) continue;
		registerEventRecord(element, record);
	}
	for (const eventName of rowEventNames) installEventListener(eventName);
	return {
		registerEventRecord,
		dispose() {
			for (const release of releases.splice(0)) release();
		},
	};
}

// A record matched the element but its action kind names no route: the payload
// and this runtime disagree, which is a defect rather than a stray event.
function unroutedDelegatedTriggerError(actionKind: string): Error {
	const code = 'MARKLESS_CSR_DELEGATED_TRIGGER_UNMATCHED';
	const error = new Error(`${code}: event record names no ${actionKind} route`) as Error &
		Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = code;
	error.phase = 'event';
	error.dispatchModuleId = 'web:render-csr';
	return error;
}

// Live-channel values only: a served cell's encoded `value` is an envelope, and
// an envelope object is truthy whatever it wraps.
function readSeededStateValue(
	state: ProtocolStatePayload,
	graphNodeId: string,
	path: ReadonlyArray<string> = [],
): unknown {
	const seeded =
		state.cells.find((cell) => cell.graphNodeId === graphNodeId) ??
		state.computed.find((computed) => computed.graphNodeId === graphNodeId);
	let value = seeded?.directValue;
	for (const key of path) {
		if (value === null || typeof value !== 'object') return undefined;
		value = (value as Record<string, unknown>)[key];
	}
	return value;
}

function delegatedTargetTag(target: { readonly tagName?: unknown } | null | undefined): string {
	return typeof target?.tagName === 'string' ? target.tagName.toLowerCase() : 'element';
}

type CsrDomJournalTarget = {
	textContent?: string | null;
	setAttribute?: (name: string, value: string) => void;
	removeAttribute?: (name: string) => void;
	readonly [name: string]: unknown;
};

async function applyDefaultCsrDomJournal(
	entries: ReadonlyArray<DomJournalEntry>,
	runtime: ResumeRuntime,
): Promise<void> {
	const deferred: DomJournalEntry[] = [];
	for (const entry of entries) {
		if (entry.type === 'setText') {
			const target = runtime.getElement(String(entry.locator)) as
				| CsrDomJournalTarget
				| undefined;
			if (!target) continue;
			// A rewrite with the value already there is still a mutation, and an
			// aria-live region announces on it.
			const text = stringifyDomValue(entry.value);
			if (target.textContent !== text) target.textContent = text;
			continue;
		}
		if (entry.type === 'setAttr') {
			const target = runtime.getElement(String(entry.locator)) as
				| CsrDomJournalTarget
				| undefined;
			if (!target) continue;
			const text = marklessAttributeValue(entry.name, entry.value);
			if (text === null) {
				target.removeAttribute?.(entry.name);
			} else {
				target.setAttribute?.(entry.name, text);
			}
			continue;
		}
		if (entry.type === 'setProp') {
			const target = runtime.getElement(String(entry.locator)) as
				| Record<string, unknown>
				| undefined;
			if (target) target[entry.name] = entry.value;
			continue;
		}
		deferred.push(entry);
	}

	if (deferred.length === 0) return;
	const { applyDomJournalEntries } = await import('./dom-journal.ts');
	applyDomJournalEntries(deferred, {
		resolveTarget(locator) {
			const rangeAnchor = /^(branch|async-boundary):(.+?):(start|end)$/.exec(String(locator));
			if (rangeAnchor) {
				const record =
					rangeAnchor[1] === 'branch'
						? runtime.getBranch(rangeAnchor[2]!)
						: runtime.getAsyncBoundary(rangeAnchor[2]!);
				const target = rangeAnchor[3] === 'end' ? record?.endAnchor : record?.startAnchor;
				if (!target) throw missingCsrJournalTargetError(String(locator));
				return target;
			}
			return runtime.getElement(String(locator));
		},
	});
}

function withCsrCallbackSymbols(
	loadSymbol: ResumeRuntimeInput['loadSymbol'],
	view: ProtocolViewPayload,
): ResumeRuntimeInput['loadSymbol'] {
	const callbacks = (
		view as ProtocolViewPayload & {
			readonly __marklessCsrCallbacks?: Readonly<Record<string, (event: unknown) => unknown>>;
		}
	).__marklessCsrCallbacks;
	return callbacks
		? (symbolId) => {
				const callback = callbacks[symbolId];
				if (!callback) return loadSymbol(symbolId);
				return async (context) => {
					const event = context.event as Record<string, unknown> | undefined;
					if (event) event.__marklessCsrCallbackDispatched = true;
					const result = callback(context.event);
					if (isPromiseLike(result)) await result;
				};
			}
		: loadSymbol;
}

function missingCsrJournalTargetError(locator: string): Error {
	const error = new Error(
		`MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING: CSR DOM journal could not resolve ${locator}.`,
	) as Error & Record<string, unknown>;
	error.name = 'RuntimeResumeError';
	error.code = 'MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING';
	error.phase = 'runtime';
	error.locator = locator;
	error.dispatchModuleId = 'web:render-csr';
	error.docsUrl = 'https://markless.dev/errors/MARKLESS_CSR_DOM_JOURNAL_TARGET_MISSING';
	return error;
}

function stringifyDomValue(value: unknown): string {
	if (value == null) return '';
	return String(value);
}

const EMPTY_PROTOCOL_VERSION = 1 satisfies ProtocolStatePayload['version'];

function emptyStatePayload(): ProtocolStatePayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		cells: [],
		computed: [],
	};
}

function emptyViewPayload(): ProtocolViewPayload {
	return {
		version: EMPTY_PROTOCOL_VERSION,
		locators: [],
		events: [],
		domUpdates: [],
		behaviors: [],
		elementHandles: [],
		asyncBoundaries: [],
	};
}

function missingLoadSymbol(symbolId: string): ResumeSymbol {
	throw new Error(`Cannot load async symbol ${symbolId} without a generated symbol resolver.`);
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
	return (
		value !== null &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as { readonly then?: unknown }).then === 'function'
	);
}

// CSR mounts share the resume graph wiring so async boundary runners load
// through the same generated symbol resolver as browser resume.
async function createFullRuntimeGraph(input: {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: CsrRenderOutput['root'];
	readonly loadSymbol: NonNullable<CsrRenderOutput['loadSymbol']>;
	readonly hasAuthoredState: boolean;
}): Promise<RuntimeGraph> {
	if (input.hasAuthoredState) {
		const { createRuntimeGraphFromResumePayload } =
			await import('./payload-graph-construct.ts');
		return await createRuntimeGraphFromResumePayload({
			state: input.state,
			view: input.view,
			root: input.root,
			loadSymbol: input.loadSymbol,
		});
	}

	const { createRuntimeGraph } = await import('@markless/runtime');
	return createRuntimeGraph({ cells: [] });
}

// CSR runs where the compiled module already used the document global to
// build its root, so the same document parses branch flip fragments.
function globalDocumentBranchHtml():
	| ((html: string) => ReadonlyArray<import('./resume.ts').ResumeDomNode>)
	| undefined {
	const documentHost = (
		globalThis as {
			readonly document?: {
				readonly createElement?: (tagName: string) => {
					innerHTML: string;
					readonly content?: { readonly childNodes?: ArrayLike<unknown> };
				};
			};
		}
	).document;
	if (typeof documentHost?.createElement !== 'function') return undefined;
	return (html) => {
		const template = documentHost.createElement!('template');
		template.innerHTML = html;
		return Array.from(template.content?.childNodes ?? []) as ReadonlyArray<
			import('./resume.ts').ResumeDomNode
		>;
	};
}
