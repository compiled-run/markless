import type { ProtocolStatePayload } from '@markless/serializer';
import {
	deletePath,
	dirtyPathForGraphWrite,
	pathsIntersect,
	readPath,
	writePath,
} from './graph-core.ts';
import {
	applyCollectionCall,
	collectionCallMutated,
	collectionMutationSnapshot,
} from './graph-collections.ts';
import type { RuntimeAsyncComputedNode } from './graph-async-load.ts';
import type { HeldInputsPlaneFactory } from './graph-held.ts';
import {
	createRuntimeComputedNodes,
	indexRuntimeDependents,
	markDirtyComputedDependencies,
	readComputedNode,
	type RuntimeComputedNode,
	type RuntimeDependents,
} from './graph-computed.ts';
import type {
	DerivedReconcileInternals,
	DerivedReconcilePlane,
	DerivedReconcilePlaneFactory,
	RuntimeGraphReconcileOptions,
} from './graph-reconcile.ts';
import { appendJournalResult, type DirtyPath } from './graph-scheduler.ts';
import { createSharedGraphPlane } from './graph-shared.ts';

declare const __MARKLESS_DEBUG_ENABLED__: boolean;

// Types only: importing the plane's runtime is the app's choice, and a graph
// that never installs it must not carry the module.
export type {
	DerivedReconcileInternals,
	DerivedReconcilePlane,
	DerivedReconcilePlaneFactory,
	DiffDerivedValueInput,
	RuntimeGraphReconcileKey,
	RuntimeGraphReconcileOptions,
	WriteTouchedRecord,
} from './graph-reconcile.ts';
export type { HeldInputsPlane, HeldInputsPlaneFactory } from './graph-held.ts';
export type { RuntimeAsyncComputedNode } from './graph-async-load.ts';

/** What a graph hands its async plane. */
export type AsyncComputedPlaneInternals = {
	readonly cells: ReadonlyMap<string, unknown>;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
	readonly reconcile?: Pick<DerivedReconcilePlane, 'publishAsync'>;
	/** No handler statement follows an async answer, so what it dirties lands in the pass, past the write observers. */
	readonly landWithoutObservers: (land: () => void) => void;
	/** Runs the flush now, ignoring any `holdFlush` in effect; only `markEntry`/`endEntry` use it, to stay visible through a held dispatch. */
	readonly flush?: () => Promise<void>;
	/** True while a repeating timer's turn, through its awaited continuations, is running: a write made then refreshes quietly. */
	readonly isQuiet?: () => boolean;
	/** True while a write's dirty paths are still queued or being processed; `endEntry` waits on this before concluding a handler's write never reached anything. */
	readonly hasPendingFlush?: () => boolean;
};

/** Async computeds, from `@markless/runtime/graph-async`; a graph without async values never loads it. */
export type AsyncComputedPlane = {
	readonly nodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly read: (node: RuntimeAsyncComputedNode, path: ReadonlyArray<string>) => unknown;
	readonly invalidate: (node: RuntimeAsyncComputedNode) => void;
	/** Starts the runs that writes since the last call asked for; a flush calls it before its subscriptions read. */
	readonly startWritten?: () => void;
	readonly define: (asyncComputed: RuntimeGraphAsyncComputed) => void;
	/** Re-runs a rejected async value with the key it already has, or quietly revalidates a fulfilled one when `revalidate` is set; false otherwise. */
	readonly rerun: (graphNodeId: string, revalidate?: boolean) => boolean;
	/** The listed async values and every async value they read through sync computeds, each input before its readers. */
	readonly withInputs: (graphNodeIds: Iterable<string>) => RuntimeAsyncComputedNode[];
	/** After a write, loudly re-asks each value still at the version it had when the writes settled, in the order given; a read still in flight starts over. Resolves once every re-asked value has settled and that commit has flushed. */
	readonly refreshAfterWrite: (versions: ReadonlyMap<string, number>, started?: () => void) => Promise<void>;
	/** Publishes a `rejected` snapshot for a handler's own rejection, standing in for the async value's own run; a no-op when the node does not exist. */
	readonly failHandler: (graphNodeId: string, error: unknown) => void;
	/** Marks a settled value busy ahead of the write that will really refresh it. */
	readonly markEntry: (graphNodeId: string, save?: boolean) => void;
	/**
	 * Ends one `markEntry` hold; the mark ends with the last holder. `save` ends a save's hold, which no write stands behind,
	 * so it ends without waiting for a pending flush; `'failed'` makes the publish that ends the mark announce a failure, and
	 * `'left'` (the page went elsewhere) makes it end silently.
	 */
	readonly endEntry: (graphNodeId: string, save?: 'saved' | 'failed' | 'left') => void;
	/** Installs matched values, from `@markless/runtime/graph-held`. */
	readonly holdInputs: (factory: HeldInputsPlaneFactory) => void;
	readonly shownRead: (
		dependencies: ReadonlyArray<RuntimeGraphComputedDependency>,
	) => RuntimeGraphRead | false | undefined;
	/** A node or path was written: a derived cell reading it is stale until written. */
	readonly wrote: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	/** A derive of a sync hop's cell starts; the call it returns ends it, waking async readers it held when it wrote nothing. */
	readonly startDerive: (graphNodeId: string) => () => void;
};

export type AsyncComputedPlaneFactory = (
	internals: AsyncComputedPlaneInternals,
	asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>,
) => AsyncComputedPlane;

export type RuntimeGraphCell = {
	readonly graphNodeId: string;
	readonly value: unknown;
	readonly readInitializer?: () => unknown;
};

export type RuntimeGraphRead = (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;

export type RuntimeGraphComputedDependency = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	/** The control showing this text writes this state from its own handler: it reads as written, never as the shown value was fetched. */
	readonly writtenByControl?: true;
};

export type RuntimeGraphComputed = {
	readonly graphNodeId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	readonly compute: (read: RuntimeGraphRead) => unknown;
	/** How re-derived values reconcile against the node's previous value. */
	readonly reconcile?: RuntimeGraphReconcileOptions;
};

export type RuntimeGraphComputedDependencyNode = Omit<RuntimeGraphComputed, 'compute'> & {
	readonly compute?: never;
};

export type RuntimeGraphAsyncSnapshot =
	| {
			readonly status: 'idle';
			readonly version: 0;
	  }
	| {
			readonly status: 'pending';
			readonly version: number;
			readonly key: unknown;
			// A re-run carries the prior settled value so event-time reads keep
			// answering with it until the new snapshot commits (spec D8: "the
			// prior value is always addressable"; Solid 2 `latest` semantics).
			readonly value?: unknown;
			/** The key `value` was fetched for; present only when a settled value exists. */
			readonly valueKey?: unknown;
			/** This run started outside a user action: no busy mark, no announcement. */
			readonly quiet?: boolean;
	  }
	| {
			readonly status: 'fulfilled';
			readonly version: number;
			readonly key: unknown;
			readonly value: unknown;
			readonly quiet?: boolean;
			/** Published when a save that held this value failed: the busy marks clearing announce a failure. */
			readonly writeFailed?: true;
			/** Published when a save that held this value sent the page elsewhere: the busy marks clear without a word. */
			readonly pageLeft?: true;
	  }
	| {
			readonly status: 'rejected';
			readonly version: number;
			readonly key: unknown;
			readonly error: unknown;
			/** A failed refresh keeps the last good value, fetched for `valueKey`. */
			readonly value?: unknown;
			readonly valueKey?: unknown;
			readonly quiet?: boolean;
			readonly writeFailed?: true;
			readonly pageLeft?: true;
	  };

export type RuntimeGraphAsyncComputed = {
	readonly graphNodeId: string;
	readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
	/** Sync computeds in the key, held as cells their derives write: a write to a source holds a run until the derive answers. */
	readonly syncHops?: ReadonlyArray<{
		readonly graphNodeId: string;
		readonly dependencies: ReadonlyArray<RuntimeGraphComputedDependency>;
		readonly asyncFrom: ReadonlyArray<string>;
	}>;
	readonly initialSnapshot?: RuntimeGraphAsyncSnapshot;
	/** A @try's own gate: it takes on a failed value it gates instead of pinning past it. */
	readonly boundaryGate?: true;
	readonly key: (read: RuntimeGraphRead) => unknown;
	/** How a fulfilled value reconciles against the previously published one. */
	readonly reconcile?: RuntimeGraphReconcileOptions;
	readonly run: (input: {
		readonly key: unknown;
		readonly signal: AbortSignal;
		readonly read: RuntimeGraphRead;
	}) => unknown | Promise<unknown>;
};

export type DomJournalEntry =
	| {
			readonly type: 'setText';
			readonly locator: string;
			readonly value: unknown;
			/** The one child text node this write owns, when its element holds other children too. */
			readonly node?: (host: unknown) => unknown;
	  }
	| {
			readonly type: 'setAttr' | 'setProp';
			readonly locator: string;
			readonly name: string;
			readonly value: unknown;
	  }
	| {
			readonly type: 'insertRange';
			readonly locator: string;
			readonly fragment: unknown;
	  }
	| {
			readonly type: 'removeRange';
			readonly locator: string;
	  }
	| {
			readonly type: 'moveRange';
			readonly locator: string;
			readonly before: string;
	  }
	| {
			readonly type: 'runCleanup';
			readonly locator: string;
	  };

export type DomJournalResult = DomJournalEntry | ReadonlyArray<DomJournalEntry>;

export type DomJournalListener = (entries: ReadonlyArray<DomJournalEntry>) => void | Promise<void>;

export type RuntimeGraphInput = {
	readonly cells: ReadonlyArray<RuntimeGraphCell>;
	readonly computed?: ReadonlyArray<RuntimeGraphComputed | RuntimeGraphComputedDependencyNode>;
	readonly asyncComputed?: ReadonlyArray<RuntimeGraphAsyncComputed>;
	readonly sharedDefinitions?: ProtocolStatePayload['sharedDefinitions'];
	/**
	 * Installs derived reconciliation, from
	 * `@markless/runtime/graph-reconcile`. Without it a computed invalidation
	 * dirties the whole node and an async commit dirties the whole snapshot.
	 */
	readonly reconcile?: DerivedReconcilePlaneFactory;
	/** Required when `asyncComputed` is non-empty; `@markless/runtime/graph-async`. */
	readonly async?: AsyncComputedPlaneFactory;
	/** Matched values for async computeds; `@markless/runtime/graph-held`. */
	readonly held?: HeldInputsPlaneFactory;
};

export type RuntimeGraphWrite = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeGraphSharedWrite = {
	readonly definitionId: string;
	readonly propertyName: string;
	readonly path?: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeGraphSharedPatchOperation = readonly [
	operation: 'set',
	path: ReadonlyArray<string>,
	value: unknown,
];

export type RuntimeGraphSharedPatch = {
	readonly id: string;
	readonly scope?: RuntimeSharedDefinition['scope'];
	readonly version: number;
	readonly patch: ReadonlyArray<RuntimeGraphSharedPatchOperation>;
};

export type RuntimeGraphUpdate = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly update: (value: unknown) => unknown;
	readonly returnValue?: 'previous' | 'next';
};

export type RuntimeGraphCall = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly method: string;
	readonly args?: ReadonlyArray<unknown>;
};

export type RuntimeGraphChange = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

export type RuntimeGraphDelete = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
};

/** DOM work a subscription holds back until its whole pass has run, so it lands in one task with that pass's journal. */
export type RuntimeGraphCommit = () => void | Promise<void>;

export type RuntimeGraphSubscription = {
	readonly id: string;
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	readonly run: (
		value: unknown,
	) =>
		| DomJournalResult
		| RuntimeGraphCommit
		| void
		| Promise<DomJournalResult | RuntimeGraphCommit | void>;
	/** The code `run` needs, a promise while it still loads: a write observer then leaves its DOM to the pass, and the pass waits for it before its commits land. */
	readonly code?: () => unknown;
};

/**
 * Told about a write the moment it lands, before the flush that write schedules.
 *
 * The flush is a microtask behind the statement that wrote, so a handler reading
 * back what its own write produced - a keyed repeat's rows most of all - reads
 * the pre-write answer. An observer runs synchronously inside the write instead,
 * so the next statement of the same handler sees the result.
 *
 * It runs for a write to `graphNodeId` under an intersecting path, and for a
 * write to anything `graphNodeId` derives from, so a computed-backed collection
 * is reached through the state write behind it. It never runs during a flush -
 * the flush's own subscription pass is the single answer there - and never
 * re-enters: a write made from inside an observer notifies nobody.
 *
 * `run` is handed no value and answers with none: it is a place to react, not a
 * second subscription channel, and reads whatever it needs off the graph. The
 * graph does not catch what it throws.
 */
export type RuntimeGraphWriteObserver = {
	readonly graphNodeId: string;
	readonly path?: ReadonlyArray<string>;
	/**
	 * Work ALREADY in flight that this observer needs settled before it can
	 * answer a write synchronously - a demand-loaded module, above all. It starts
	 * nothing, so a caller awaiting it adds no fetch to the gesture; it only
	 * stops the gesture racing a load its own wiring began. `undefined` is
	 * nothing to wait for, and costs no microtask.
	 */
	readonly settle?: () => Promise<void> | undefined;
	readonly run: () => void;
};

export type RuntimeGraph = {
	readonly read: (graphNodeId: string, path?: ReadonlyArray<string>) => unknown;
	/** Available only in debug-enabled builds (`__MARKLESS_DEBUG_ENABLED__`). */
	readonly peekAsyncSnapshot?: (graphNodeId: string) => RuntimeGraphAsyncSnapshot | undefined;
	/** Debug builds only: the flush scheduler's phase, 0 idle, 1 scheduled, 2 running, 3 tail, 4 rearmed. */
	readonly peekFlushPhase?: () => number;
	/** Debug builds only: throws when the flush scheduler could not move from its phase now to `to`; moves nothing. */
	readonly checkFlushMove?: (to: number) => void;
	readonly readShared: (
		definitionId: string,
		propertyName: string,
		path?: ReadonlyArray<string>,
	) => unknown;
	readonly writeShared: (write: RuntimeGraphSharedWrite) => boolean;
	readonly getSharedDefinition: (
		definitionId: string,
	) => NonNullable<ProtocolStatePayload['sharedDefinitions']>[number] | undefined;
	readonly listSharedDefinitions: () => NonNullable<ProtocolStatePayload['sharedDefinitions']>;
	readonly takeSharedPatches: () => RuntimeGraphSharedPatch[];
	readonly applySharedPatch: (patch: RuntimeGraphSharedPatch) => boolean;
	/** Answers the value written, as the assignment it lowers from does. */
	readonly write: (write: RuntimeGraphWrite) => unknown;
	readonly update: (update: RuntimeGraphUpdate) => unknown;
	readonly call: (call: RuntimeGraphCall) => unknown;
	readonly delete: (deletion: RuntimeGraphDelete) => boolean;
	/** Code outside the graph changed the value at `path` in place; everything reading it updates. */
	readonly changed: (change: RuntimeGraphChange) => void;
	readonly subscribe: (subscription: RuntimeGraphSubscription) => () => void;
	/** How many subscriptions are registered on `graphNodeId`. */
	readonly subscriptionCount?: (graphNodeId: string) => number;
	/**
	 * Runs `pull` once, at the next read of `graphNodeId` and before that read
	 * answers, so a value derived on demand can write itself first.
	 */
	readonly pullBeforeRead?: (graphNodeId: string, pull: () => void) => void;
	/** The async plane, when the graph has async values: re-runs, failures, entry marks, matched reads and derive marks go through it. */
	readonly asyncPlane?: () => AsyncComputedPlane | undefined;
	/** Adds an async computed a component rendered after the graph was built; false when the node already exists. */
	readonly defineAsyncComputed?: (
		asyncComputed: RuntimeGraphAsyncComputed,
		plane: AsyncComputedPlaneFactory,
		held?: HeldInputsPlaneFactory,
	) => boolean;
	/** A repeating timer's turn started: a write made before the matching `markQuietEnd` refreshes quietly, even while a user action is open. Nests. */
	readonly markQuietStart?: () => void;
	readonly markQuietEnd?: () => void;
	/** Whether a repeating timer's turn is open, so a callee it calls can keep that turn once its code has loaded. */
	readonly isQuiet?: () => boolean;
	/**
	 * Optional so a facade over a subset of this contract stays a `RuntimeGraph`;
	 * a caller without it gets the flush-time answer it always had.
	 */
	readonly subscribeWrite?: (observer: RuntimeGraphWriteObserver) => () => void;
	/**
	 * Settles what the write observers are already loading, so a write made after
	 * it is answered synchronously. `undefined` when nothing is in flight.
	 */
	readonly settleWriteObservers?: () => Promise<void> | undefined;
	/** Whether a write is waiting on a flush that has not yet reached the journal. */
	readonly hasPendingFlush?: () => boolean;
	/** Keeps the scheduled flush back until each returned release has run once; `flush()` itself still runs. */
	readonly holdFlush?: () => () => void;
	/** The pass that will paint pending writes, without starting it, so a hold still applies; `undefined` when nothing is pending. */
	readonly pendingFlush?: () => Promise<void> | undefined;
	/** A state write `hold` answers true for keeps its value but paints only once replayed through `changed`. */
	readonly holdPaint?: (hold: ((graphNodeId: string, path: ReadonlyArray<string>) => boolean) | undefined) => void;
	readonly subscribeJournal: (listener: DomJournalListener) => () => void;
	readonly flush: () => Promise<void>;
	readonly takeJournal: () => DomJournalEntry[];
};

type RuntimeSharedDefinition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];

// Flush scheduler phases. Scheduled and rearmed mean a microtask is queued to start a pass;
// rearmed is a write landing while journal listeners run, before the pass ends.
const FLUSH_IDLE = 0;
const FLUSH_SCHEDULED = 1;
const FLUSH_RUNNING = 2;
const FLUSH_TAIL = 3;
const FLUSH_REARMED = 4;
type FlushPhase =
	| typeof FLUSH_IDLE
	| typeof FLUSH_SCHEDULED
	| typeof FLUSH_RUNNING
	| typeof FLUSH_TAIL
	| typeof FLUSH_REARMED;

function assertFlushMove(from: FlushPhase, to: FlushPhase): void {
	let allowed: boolean;
	switch (from) {
		case FLUSH_IDLE:
			allowed = to === FLUSH_SCHEDULED || to === FLUSH_RUNNING;
			break;
		case FLUSH_SCHEDULED:
			allowed = to === FLUSH_RUNNING;
			break;
		case FLUSH_RUNNING:
			allowed = to === FLUSH_TAIL;
			break;
		case FLUSH_TAIL:
			allowed = to === FLUSH_REARMED || to === FLUSH_IDLE;
			break;
		case FLUSH_REARMED:
			allowed = to === FLUSH_IDLE;
	}
	if (!allowed) throw new Error(`Illegal flush phase move ${from} -> ${to}`);
}

export function createRuntimeGraph(input: RuntimeGraphInput): RuntimeGraph {
	const cells = new Map<string, unknown>();
	const readInitializers = new Map<string, () => unknown>();
	const computedNodes = createRuntimeComputedNodes(input.computed);
	let asyncPlane: AsyncComputedPlane | undefined;
	let dependents!: RuntimeDependents;
	// Per node, in subscribe order; the sequence number restores that order across nodes.
	const subscriptionsByNode = new Map<string, RuntimeGraphSubscription[]>();
	const subscriptionOrder = new Map<RuntimeGraphSubscription, number>();
	let subscriptionSequence = 0;
	const writeObservers: RuntimeGraphWriteObserver[] = [];
	const journalListeners: DomJournalListener[] = [];
	const dirtyPaths: DirtyPath[] = [];
	const journal: DomJournalEntry[] = [];
	let flushPhase: FlushPhase = FLUSH_IDLE;
	let quietDepth = 0;
	let notifyingWrite = false;
	// The pass from its scheduling until it lands.
	let pass: { readonly landed: Promise<void>; readonly start: () => void } | undefined;
	let flushHolds = 0;
	const moveFlush = (to: FlushPhase): void => {
		if (import.meta.env?.DEV) assertFlushMove(flushPhase, to);
		flushPhase = to;
	};
	const hasPendingFlush = () => flushPhase !== FLUSH_IDLE || dirtyPaths.length > 0;

	for (const cell of input.cells) {
		cells.set(cell.graphNodeId, cell.value);
		if (cell.readInitializer) readInitializers.set(cell.graphNodeId, cell.readInitializer);
	}

	const readGraph: RuntimeGraphRead = (graphNodeId, path = []) => {
		const computed = computedNodes.get(graphNodeId);
		if (computed?.compute) {
			return readComputedNode(
				computed,
				readGraph,
				path,
				plane?.reconcileComputed,
				asyncPlane?.shownRead,
			);
		}

		const asyncComputed = asyncPlane?.nodes.get(graphNodeId);
		if (asyncComputed) return asyncPlane!.read(asyncComputed, path);

		const initialize = readInitializers.get(graphNodeId);
		if (initialize) {
			readInitializers.delete(graphNodeId);
			const current = cells.get(graphNodeId);
			try {
				const value = initialize();
				if (!Object.is(current, value)) commitCell(graphNodeId, [], value, markDirtyPath);
			} catch {}
		}

		return readPath(cells.get(graphNodeId), path);
	};

	const markDirtyPath = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		asyncPlane?.wrote(graphNodeId, path);
		dirtyPaths.push({ graphNodeId, path });
		plane?.recordWrite(graphNodeId, path);
		markDirtyComputedDependencies(
			graphNodeId,
			path,
			dependents,
			dirtyPaths,
			plane,
			(node) => asyncPlane!.invalidate(node),
		);
		// Last, so an observer that reads back finds every computed this write
		// invalidated already marked and answering afresh.
		notifyWriteObservers(graphNodeId, path);
		scheduleFlush();
	};

	let paintHold: ((graphNodeId: string, path: ReadonlyArray<string>) => boolean) | undefined;
	const markWritten = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		if (!paintHold || computedNodes.has(graphNodeId) || !paintHold(graphNodeId, path)) markDirtyPath(graphNodeId, path);
	};

	const commitCell = (graphNodeId: string, path: ReadonlyArray<string>, value: unknown, mark = markWritten): void => {
		const current = cells.get(graphNodeId);
		cells.set(graphNodeId, writePath(current, path, value));
		mark(graphNodeId, dirtyPathForGraphWrite(current, path));
	};

	/**
	 * Whether `graphNodeId` is derived, however deeply, from the written path.
	 *
	 * A computed collection carries no dependency of its own on the state a
	 * handler writes; the chain of `dependencies` is the only thing that says so,
	 * and with a reconcile plane installed the write dirties no path under the
	 * computed for a path test to find.
	 */
	const derivesFromWrite = (
		graphNodeId: string,
		write: DirtyPath,
		seen: Set<string>,
	): boolean => {
		if (seen.has(graphNodeId)) return false;
		seen.add(graphNodeId);
		const computed = computedNodes.get(graphNodeId);
		if (!computed) return false;
		for (const dependency of computed.dependencies) {
			if (
				dependency.graphNodeId === write.graphNodeId &&
				pathsIntersect(write.path, dependency.path ?? [])
			)
				return true;
			if (derivesFromWrite(dependency.graphNodeId, write, seen)) return true;
		}
		return false;
	};

	const notifyWriteObservers = (graphNodeId: string, path: ReadonlyArray<string>): void => {
		if (writeObservers.length === 0 || flushPhase === FLUSH_RUNNING || notifyingWrite) return;

		const write: DirtyPath = { graphNodeId, path };
		if (codeThePassWaitsOn().length > 0) return;
		notifyingWrite = true;
		try {
			// A copy: an observer is free to release itself or another.
			for (const observer of writeObservers.slice()) {
				const reaches =
					observer.graphNodeId === graphNodeId
						? pathsIntersect(path, observer.path ?? [])
						: derivesFromWrite(observer.graphNodeId, write, new Set());
				if (reaches) observer.run();
			}
		} finally {
			notifyingWrite = false;
		}
	};

	const codeThePassWaitsOn = (): PromiseLike<unknown>[] =>
		dirtyPaths.flatMap(({ graphNodeId, path }) =>
			(subscriptionsByNode.get(graphNodeId) ?? []).flatMap((subscription) => {
				const code = subscription.code?.() as PromiseLike<unknown> | undefined;
				return typeof code?.then === 'function' && pathsIntersect(path, subscription.path ?? [])
					? [code]
					: [];
			}),
		);

	const openPass = (): void => {
		let start!: () => void;
		moveFlush(FLUSH_SCHEDULED);
		pass = { landed: new Promise<void>((resolve) => (start = () => resolve(runFlush()))), start };
	};

	const scheduleFlush = (): void => {
		if (flushPhase === FLUSH_IDLE) openPass();
		else if (flushPhase === FLUSH_TAIL) moveFlush(FLUSH_REARMED);
		else return;
		queueMicrotask(runScheduledFlush);
	};

	const runScheduledFlush = (): void => {
		if (!flushHolds) void flush();
	};

	const internals: DerivedReconcileInternals & AsyncComputedPlaneInternals = {
		cells,
		computedNodes,
		dirtyPaths,
		readGraph,
		markDirtyPath,
		scheduleFlush,
		hasSubscription: (graphNodeId) => !!subscriptionsByNode.get(graphNodeId)?.length,
		addSubscription(subscription) {
			let bucket = subscriptionsByNode.get(subscription.graphNodeId);
			if (!bucket) subscriptionsByNode.set(subscription.graphNodeId, (bucket = []));
			bucket.push(subscription);
			subscriptionOrder.set(subscription, subscriptionSequence++);
		},
		// Read by the async plane only; as methods they cost a page without async values nothing at load.
		get reconcile() {
			return plane;
		},
		landWithoutObservers(land) {
			const was = notifyingWrite;
			notifyingWrite = true;
			try {
				land();
			} finally {
				notifyingWrite = was;
			}
		},
		flush() {
			return flush();
		},
		isQuiet() {
			return quietDepth > 0;
		},
		hasPendingFlush() {
			return hasPendingFlush();
		},
	};
	// Without a plane a graph behaves as it did before reconciliation existed.
	const plane = input.reconcile?.(internals);

	const installAsync = (
		factory?: AsyncComputedPlaneFactory,
		held?: HeldInputsPlaneFactory,
		asyncComputed?: RuntimeGraphAsyncComputed,
	) => {
		asyncPlane ??= factory?.(internals, input.asyncComputed);
		if (held) asyncPlane!.holdInputs(held);
		if (asyncComputed) asyncPlane!.define(asyncComputed);
		dependents = indexRuntimeDependents(computedNodes, asyncPlane?.nodes);
	};
	installAsync(input.async, input.held);

	const sharedGraph = createSharedGraphPlane({
		cells,
		sharedDefinitionsInput: input.sharedDefinitions,
		readGraph,
		markDirtyPath,
		scheduleFlush,
	});

	// Published before the pass runs: synchronous subscriptions reach the journal before runFlush returns.
	const flush = (): Promise<void> => {
		if (flushPhase === FLUSH_IDLE) openPass();
		// A pass that throws before its first await has already cleared `pass` when start returns.
		const current = pass!;
		if (flushPhase === FLUSH_SCHEDULED) current.start();
		return current.landed;
	};

	// A rearmed write lands in the pass its tail pass opens on ending.
	const pendingFlush = (): Promise<void> | undefined =>
		flushPhase === FLUSH_REARMED ? pass!.landed.then(pendingFlush) : pass?.landed;

	const runFlush = async (): Promise<void> => {
		moveFlush(FLUSH_RUNNING);

		try {
			try {
				while (dirtyPaths.length > 0) {
					asyncPlane?.startWritten?.();
					plane?.recomputeSubscribed();
					const pending = dirtyPaths.splice(0);
					const ranSubscriptions = new Set<string>();
					const commits: RuntimeGraphCommit[] = [];
					// A subscription added mid-pass runs after every older one, as an appended entry would.
					for (
						let floor = 0, ceiling;
						floor < (ceiling = subscriptionSequence);
						floor = ceiling
					)
						for (const subscription of dueSubscriptions(pending, floor, ceiling)) {
							if (
								!subscriptionOrder.has(subscription) ||
								ranSubscriptions.has(subscription.id)
							)
								continue;
							ranSubscriptions.add(subscription.id);
							const ran = subscription.run(
								readGraph(subscription.graphNodeId, subscription.path ?? []),
							);
							const entries =
								typeof (ran as PromiseLike<unknown>)?.then === 'function'
									? await ran
									: ran;
							if (typeof entries === 'function') commits.push(entries);
							else appendJournalResult(journal, entries as DomJournalResult | void);
						}
					if (commits.length > 0) {
						// The next round's code loads first, so its journal paints in the task these commits do.
						const waits = codeThePassWaitsOn();
						if (waits.length > 0) await Promise.all(waits.map((code) => code.then(undefined, () => {})));
						const landing = commits.map((commit) => commit());
						await notifyJournalListeners();
						await Promise.all(landing);
					}
				}
			} finally {
				try {
					plane?.settleBaselines();
				} finally {
					moveFlush(FLUSH_TAIL);
				}
			}

			await notifyJournalListeners();
		} finally {
			pass = undefined;
			// A tail write's own microtask found this pass still active, so the pass end wakes it.
			moveFlush(FLUSH_IDLE);
			if (dirtyPaths.length > 0) scheduleFlush();
		}
	};

	const dueSubscriptions = (pending: DirtyPath[], floor: number, ceiling: number) => {
		const due = new Set<RuntimeGraphSubscription>();
		for (const { graphNodeId, path } of pending)
			for (const subscription of subscriptionsByNode.get(graphNodeId) ?? []) {
				const order = subscriptionOrder.get(subscription)!;
				if (
					order >= floor &&
					order < ceiling &&
					pathsIntersect(path, subscription.path ?? [])
				)
					due.add(subscription);
			}
		return [...due].sort(
			(left, right) => subscriptionOrder.get(left)! - subscriptionOrder.get(right)!,
		);
	};

	const notifyJournalListeners = async (): Promise<void> => {
		if (journalListeners.length === 0 || journal.length === 0) return;

		const entries = journal.splice(0);
		for (const listener of journalListeners) {
			await listener(entries);
		}
	};

	return {
		read: readGraph,
		...(typeof __MARKLESS_DEBUG_ENABLED__ !== 'undefined' && __MARKLESS_DEBUG_ENABLED__
			? {
					peekAsyncSnapshot: (graphNodeId: string) =>
						asyncPlane?.nodes.get(graphNodeId)?.snapshot,
					peekFlushPhase: () => flushPhase,
					checkFlushMove: (to: number) => assertFlushMove(flushPhase, to as FlushPhase),
				}
			: {}),
		readShared: sharedGraph.readShared,
		writeShared: sharedGraph.writeShared,
		getSharedDefinition: sharedGraph.getSharedDefinition,
		listSharedDefinitions: sharedGraph.listSharedDefinitions,
		takeSharedPatches: sharedGraph.takeSharedPatches,
		applySharedPatch: sharedGraph.applySharedPatch,
		write(write) {
			const path = write.path ?? [];
			const current = cells.get(write.graphNodeId);
			// Map presence separates an unseeded node from one holding undefined; computeds
			// carry no payload value, so their first derive to undefined must not read as a no-op.
			const seeded = cells.has(write.graphNodeId);
			if (
				!seeded ||
				!(
					plane?.commitDerived(write, path) ||
					Object.is(readPath(current, path), write.value)
				)
			)
				commitCell(write.graphNodeId, path, write.value);
			return write.value;
		},
		update(update) {
			const path = update.path ?? [];
			const currentValue = readPath(cells.get(update.graphNodeId), path);
			const nextValue = update.update(currentValue);
			if (!Object.is(currentValue, nextValue))
				commitCell(update.graphNodeId, path, nextValue);
			if (update.returnValue === 'previous') return currentValue;
			if (update.returnValue === 'next') return nextValue;
		},
		call(call) {
			const path = call.path ?? [];
			const target = readPath(cells.get(call.graphNodeId), path);
			const beforeMutation = collectionMutationSnapshot(target, call.method, call.args ?? []);
			const result = applyCollectionCall(target, call.method, call.args ?? []);

			if (collectionCallMutated(call.method, result, beforeMutation)) {
				markWritten(call.graphNodeId, path);
			}

			return result;
		},
		delete(deletion) {
			const outcome = deletePath(cells.get(deletion.graphNodeId), deletion.path);
			if (outcome.mutated) {
				markWritten(deletion.graphNodeId, deletion.path);
			}

			return outcome.result;
		},
		changed: ({ graphNodeId, path }) => markDirtyPath(graphNodeId, path),
		asyncPlane() {
			return asyncPlane;
		},
		markQuietStart() {
			quietDepth++;
		},
		markQuietEnd() {
			quietDepth = Math.max(0, quietDepth - 1);
		},
		isQuiet() {
			return quietDepth > 0;
		},
		defineAsyncComputed(asyncComputed, factory, held) {
			const id = asyncComputed.graphNodeId;
			if (asyncPlane?.nodes.has(id) || cells.has(id)) return false;
			installAsync(factory, held, asyncComputed);
			return true;
		},
		subscribe(subscription) {
			internals.addSubscription(subscription);
			// Disposal contract: removed scopes unsubscribe their graph wiring
			// (spec 01-tsrx-host-contract "branch scope disposal").
			// The release forgets the subscription, so a list still holding the release keeps nothing it bound alive.
			let held: RuntimeGraphSubscription | undefined = subscription;
			return () => {
				if (!held) return;
				const bucket = subscriptionsByNode.get(held.graphNodeId)!;
				const index = bucket.indexOf(held);
				if (index >= 0) bucket.splice(index, 1);
				subscriptionOrder.delete(held);
				held = undefined;
			};
		},
		subscriptionCount: (graphNodeId) => subscriptionsByNode.get(graphNodeId)?.length ?? 0,
		pullBeforeRead(graphNodeId, pull) {
			// The pull writes the node itself, so the initializer answers what it held before.
			readInitializers.set(graphNodeId, () => {
				const before = cells.get(graphNodeId);
				pull();
				return before;
			});
		},
		subscribeWrite(observer) {
			writeObservers.push(observer);
			return () => {
				const index = writeObservers.indexOf(observer);
				if (index >= 0) writeObservers.splice(index, 1);
			};
		},
		hasPendingFlush,
		pendingFlush,
		holdPaint(hold) {
			paintHold = hold;
		},
		holdFlush() {
			flushHolds++;
			let held = true;
			return () => {
				if (!held) return;
				held = false;
				if (!--flushHolds && (flushPhase === FLUSH_SCHEDULED || flushPhase === FLUSH_REARMED))
					queueMicrotask(runScheduledFlush);
			};
		},
		settleWriteObservers() {
			let pending: Promise<unknown>[] | undefined;
			for (const observer of writeObservers) {
				const settling = observer.settle?.();
				// A failed load is the flush's to report, from the pass that needs it.
				if (settling) (pending ??= []).push(settling.catch(() => undefined));
			}
			return pending && Promise.all(pending).then(() => undefined);
		},
		subscribeJournal(listener) {
			journalListeners.push(listener);
			return () => {
				const index = journalListeners.indexOf(listener);
				if (index >= 0) journalListeners.splice(index, 1);
			};
		},
		flush,
		takeJournal() {
			return journal.splice(0);
		},
	};
}
