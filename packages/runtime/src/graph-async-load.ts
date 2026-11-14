import type {
	AsyncComputedPlane,
	AsyncComputedPlaneInternals,
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { pathsIntersect, readPath } from './graph-core.ts';
import { isAsyncSnapshotMetaKey } from './graph-scheduler.ts';
import type { HeldInputsPlane } from './graph-held.ts';

/** One input a key read, with the value it had when the run started. */
export type RuntimeAsyncInput = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeAsyncAnswer = { readonly value: unknown; readonly inputs: ReadonlyArray<RuntimeAsyncInput> };

// Where an async value is in its life. Only `moveNode` changes it; the snapshot stays the value readers see.
// Order matters: up to planned a demand starts a run; from running up a run started or settled on the snapshot's key.
export const NODE_IDLE = 0;
/** Starts a run on its next demand, even on the key it already has: a payload-planned pending value or a rerun. */
export const NODE_PLANNED = 1;
/** Waits on an async input, showing pending or its error; runs again once that input settles, even on the same key. */
export const NODE_BLOCKED = 2;
export const NODE_RUNNING = 3;
/** A run on the inputs the screen shows while an async input refreshes; it lands into blocked. */
export const NODE_RUNNING_ON_SHOWN = 4;
export const NODE_SETTLED = 5;

export type AsyncNodePhase =
	| typeof NODE_IDLE
	| typeof NODE_PLANNED
	| typeof NODE_BLOCKED
	| typeof NODE_RUNNING
	| typeof NODE_RUNNING_ON_SHOWN
	| typeof NODE_SETTLED;

/** Throws when an async value could not move from `from` to `to`. */
export function assertAsyncNodeMove(from: AsyncNodePhase, to: AsyncNodePhase): void {
	let allowed: boolean;
	switch (to) {
		case NODE_PLANNED:
			allowed = from === NODE_PLANNED || from === NODE_SETTLED || from === NODE_BLOCKED;
			break;
		case NODE_RUNNING:
		case NODE_BLOCKED:
			allowed = true;
			break;
		case NODE_RUNNING_ON_SHOWN:
			allowed = from !== NODE_IDLE;
			break;
		case NODE_SETTLED:
			allowed = from !== NODE_PLANNED && from !== NODE_BLOCKED;
			break;
		default:
			allowed = false;
	}
	if (!allowed) throw new Error(`Illegal async node phase move ${from} -> ${to}`);
}

export function moveNode(node: RuntimeAsyncComputedNode, to: AsyncNodePhase): void {
	if (import.meta.env?.DEV) assertAsyncNodeMove(node.phase, to);
	node.phase = to;
}

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	phase: AsyncNodePhase;
	/** Aborts the latest run; a settled run's signal still aborts when the next one starts. */
	controller?: AbortController;
	snapshot: RuntimeGraphAsyncSnapshot;
	/** The newest publish; a run whose number it no longer is lands nothing. */
	version: number;
	/** The inputs the shown value was fetched with; only a held-inputs plane captures them. */
	valueInputs?: ReadonlyArray<RuntimeAsyncInput>;
	/** Answers a newer one superseded, newest first, each kept only while a pinned value still reads it (Kept answers). */
	priorAnswers?: ReadonlyArray<RuntimeAsyncAnswer>;
	/** Async values some reader reads beside this one. */
	readWith?: Set<RuntimeAsyncComputedNode>;
	/** A reader read an input as `valueInputs` holds it, so the landing must reach that reader. */
	pinned?: boolean;
	/** The key a served value was fetched with; its snapshot carries none. */
	servedKey?: { readonly key: unknown };
	/** The key of the run on held inputs, in flight or landed, while its async inputs still refresh. */
	waitingFor?: { readonly key: unknown };
	/**
	 * Marked busy ahead of what will refresh it: by handlers that write one of its key inputs (`holders`) and by saves still being
	 * written (`writing`); it ends with the last of them. While a save is written, a run that lands is kept in `landed`, published if
	 * the hold ends with nothing newer running. A failed save's hold outlives a run in flight to tag that run's landing.
	 */
	entryHold?: EntryHold;
	/** Set when the run that is in flight started outside a user action; carried onto every snapshot that run publishes. */
	quiet?: boolean;
};

// An entry hold marks its value while it has holders; with none left and a run in flight, that run's landing ends it.
export const HOLD_MARKING = 0;
export const HOLD_ENDING = 1;
export type HoldPhase = typeof HOLD_MARKING | typeof HOLD_ENDING;
// How the saves that held a value ended; a later one only raises it: answered, one failed, or the page went elsewhere.
export const SAVES_ANSWERED = 0;
export const SAVES_FAILED = 1;
export const SAVES_LEFT = 2;
export type SavesOutcome = typeof SAVES_ANSWERED | typeof SAVES_FAILED | typeof SAVES_LEFT;

/**
 * Marks a value busy ahead of what will refresh it: handlers that write one of its key inputs (`holders`) and saves still being
 * written (`writing`). While a save is written, a run that lands is kept in `landed`, published if the hold ends with nothing
 * newer running. `outcome` is what the publish that ends the mark says.
 */
export type EntryHold = {
	phase: HoldPhase;
	readonly version: number;
	readonly previous: RuntimeGraphAsyncSnapshot;
	holders: number;
	writing: number;
	outcome: SavesOutcome;
	landed?: (outcome: SavesOutcome) => boolean;
};

/** Throws when a hold could not move from `from` to `to`: a hold ends only from ending, and a new holder brings it back. */
export function assertHoldMove(from: HoldPhase, to: HoldPhase): void {
	if (from === to) throw new Error(`Markless entry hold: no move from ${from} to ${to}`);
}

export function moveHold(hold: EntryHold, to: HoldPhase): void {
	if (import.meta.env?.DEV) assertHoldMove(hold.phase, to);
	hold.phase = to;
}

/** What started a run: a graph write, or a page shown again re-asking a settled value; neither for a plain read. */
export type RunCause = 'write' | 'revalidate';

/** What the async plane shares with the held-inputs plane. */
export type AsyncPlaneContext = AsyncComputedPlaneInternals & {
	readonly asyncComputedNodes: Map<string, RuntimeAsyncComputedNode>;
	readonly move: typeof moveNode;
	readonly start: (
		node: RuntimeAsyncComputedNode,
		key: unknown,
		read?: RuntimeGraphRead,
		waiting?: boolean,
	) => void;
	/** Reads a node's snapshot or value without starting it. */
	readonly peek: (node: RuntimeAsyncComputedNode, path: ReadonlyArray<string>) => unknown;
	held?: HeldInputsPlane;
};

/** What the refresh half reads: the context, plus the derived cells sync hops write, by source, and those written since their derive. */
export type AsyncPlaneState = AsyncPlaneContext & {
	/** Called for each settled snapshot a value publishes, as it publishes. */
	readonly settled: Set<(node: RuntimeAsyncComputedNode) => void>;
	/** Asks a value to run again in the next microtask, as a write to one of its inputs does. */
	readonly invalidate: (node: RuntimeAsyncComputedNode) => void;
	readonly derivedCells: Map<string, Array<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }>>;
	readonly staleDerives: Map<string, number>;
	/** Runs `run` with what it invalidates decided as `quiet`, whatever turn is open: an answer landing refreshes its readers as it was refreshed. */
	readonly decidedAs: (quiet: boolean, run: () => void) => void;
};

/** Runs, refresh scheduling, entry marks and failures: `@markless/runtime/graph-async-refresh`. */
export type AsyncRefresh = {
	readonly advance: (node: RuntimeAsyncComputedNode, cause?: RunCause) => void;
	readonly start: AsyncPlaneContext['start'];
	readonly markEntry: (node: RuntimeAsyncComputedNode, save?: boolean) => void;
	readonly endEntry: (node: RuntimeAsyncComputedNode, save?: 'saved' | 'failed' | 'left') => void;
	readonly fail: (node: RuntimeAsyncComputedNode, error: unknown) => void;
};

export type AsyncRefreshModule = { readonly bindAsyncRefresh: (state: AsyncPlaneState) => AsyncRefresh };

function createNode(asyncComputed: RuntimeGraphAsyncComputed): RuntimeAsyncComputedNode {
	const snapshot: RuntimeGraphAsyncSnapshot = asyncComputed.initialSnapshot ?? {
		status: 'idle',
		version: 0,
	};
	return {
		...asyncComputed,
		phase: snapshot.status === 'pending' ? NODE_PLANNED : snapshot.status === 'idle' ? NODE_IDLE : NODE_SETTLED,
		snapshot,
		version: snapshot.version,
	};
}

function peek(node: RuntimeAsyncComputedNode, path: ReadonlyArray<string>): unknown {
	const head = path[0];
	return head === undefined || isAsyncSnapshotMetaKey(head)
		? readPath(node.snapshot, path)
		: readPath((node.snapshot as { readonly value?: unknown }).value, path);
}

/** Async computeds as a plane; `refresh` answers the refresh half or its promise, and calls made while it loads run in order. */
export function createAsyncPlane(
	internals: AsyncComputedPlaneInternals,
	asyncComputed: ReadonlyArray<RuntimeGraphAsyncComputed> | undefined,
	refresh: () => AsyncRefreshModule | PromiseLike<AsyncRefreshModule>,
): AsyncComputedPlane {
	const nodes = new Map<string, RuntimeAsyncComputedNode>();
	let state: AsyncPlaneState | undefined;
	let bound: AsyncRefresh | undefined;
	let queued: Array<(bound: AsyncRefresh) => void> | undefined;
	let replaying: boolean | undefined;
	// Inputs written in one synchronous turn start one run per value, on the final inputs; a read in between starts them first.
	let written: Map<RuntimeAsyncComputedNode, boolean | undefined> | undefined;
	const invalidate = (node: RuntimeAsyncComputedNode): void => {
		if (node.phase === NODE_IDLE || nodes.get(node.graphNodeId) !== node) return;
		if (!written) {
			written = new Map();
			queueMicrotask(startWritten);
		}
		const quiet = context().isQuiet?.() === true;
		written.set(node, (written.get(node) ?? true) && quiet);
	};
	// Built on first use: a page whose values all arrived settled may never need it.
	const context = (): AsyncPlaneState =>
		(state ??= {
			...internals,
			asyncComputedNodes: nodes,
			move: moveNode,
			settled: new Set(),
			invalidate,
			derivedCells: new Map(),
			staleDerives: new Map(),
			start: (...args) => bound!.start(...args),
			peek,
			isQuiet: internals.isQuiet && (() => replaying ?? internals.isQuiet!()),
			decidedAs: (quiet, run) => {
				const outer = replaying;
				replaying = quiet;
				try {
					run();
				} finally {
					replaying = outer;
				}
			},
		});
	const withRefresh = (run: (bound: AsyncRefresh) => void): void => {
		if (bound) return run(bound);
		const quiet = context().isQuiet?.();
		const replay = (loaded: AsyncRefresh) => {
			replaying = quiet;
			try {
				run(loaded);
			} finally {
				replaying = undefined;
			}
		};
		if (queued) return void queued.push(replay);
		const module = refresh();
		if (typeof (module as PromiseLike<unknown>).then !== 'function')
			return run((bound = (module as AsyncRefreshModule).bindAsyncRefresh(state!)));
		queued = [replay];
		void (module as PromiseLike<AsyncRefreshModule>).then((loaded) => {
			bound = loaded.bindAsyncRefresh(state!);
			for (const each of queued!) each(bound);
			queued = undefined;
		});
	};
	const add = (node: RuntimeAsyncComputedNode): void => {
		nodes.set(node.graphNodeId, node);
		if (node.syncHops) {
			const { derivedCells } = context();
			for (const hop of node.syncHops)
				for (const { graphNodeId: source, path = [] } of hop.dependencies)
					derivedCells.set(source, [...(derivedCells.get(source) ?? []), { graphNodeId: hop.graphNodeId, path }]);
		}
	};
	for (const each of asyncComputed ?? []) add(createNode(each));
	// Runs that writes asked of loads an arm owns, held until the pass has flipped the arm.
	let armHeld: Map<RuntimeAsyncComputedNode, boolean | undefined> | undefined;
	function startWritten(passEnd?: boolean): void {
		const batch = passEnd ? armHeld : written;
		if (passEnd) armHeld = undefined;
		else written = undefined;
		batch?.forEach((quiet, node) => {
			// A gate fetches nothing, so it never waits.
			const shown = node.boundaryGate ? undefined : internals.armShown?.(node.graphNodeId);
			if (!passEnd && shown !== undefined) return void (armHeld ??= new Map()).set(node, quiet);
			if (shown === false || nodes.get(node.graphNodeId) !== node) return;
			withRefresh((loaded) => {
				replaying = quiet;
				try {
					loaded.advance(node, 'write');
				} finally {
					replaying = undefined;
				}
			});
		});
	}
	const forward = (graphNodeId: string, call: (bound: AsyncRefresh, node: RuntimeAsyncComputedNode) => void): void => {
		const node = nodes.get(graphNodeId);
		if (node) withRefresh((loaded) => call(loaded, node));
	};

	const plane: AsyncComputedPlane = {
		nodes,
		read(node, path) {
			if (written?.has(node)) startWritten();
			if (node.phase <= NODE_PLANNED) withRefresh((loaded) => loaded.advance(node));
			return peek(node, path);
		},
		invalidate,
		startWritten,
		drop(owns) {
			for (const [graphNodeId, node] of nodes)
				if (owns(graphNodeId)) {
					node.controller?.abort();
					node.version++;
					nodes.delete(graphNodeId);
					written?.delete(node);
					armHeld?.delete(node);
				}
		},
		markEntry(graphNodeId, save) {
			forward(graphNodeId, (loaded, node) => loaded.markEntry(node, save));
		},
		endEntry(graphNodeId, save) {
			forward(graphNodeId, (loaded, node) => loaded.endEntry(node, save));
		},
		failHandler(graphNodeId, error) {
			// The failure ends a re-run its inputs asked for and has not started, as it aborts one already running.
			forward(graphNodeId, (loaded, node) => {
				written?.delete(node);
				loaded.fail(node, error);
			});
		},
		define(asyncComputed) {
			const node = createNode(asyncComputed);
			add(node);
			state?.held?.seed(node);
		},
		rerun(graphNodeId, revalidate) {
			const node = nodes.get(graphNodeId);
			if (node?.snapshot.status !== (revalidate ? 'fulfilled' : 'rejected')) return false;
			// A reset re-runs a rejected value, and a page shown again re-asks a fulfilled one, though the key has not changed.
			moveNode(node, NODE_PLANNED);
			withRefresh((loaded) => loaded.advance(node, revalidate ? 'revalidate' : undefined));
			return true;
		},
		withInputs(graphNodeIds) {
			const ordered: RuntimeAsyncComputedNode[] = [];
			const seen = new Set<string>();
			const visit = (graphNodeId: string): void => {
				if (seen.has(graphNodeId)) return;
				seen.add(graphNodeId);
				const node = nodes.get(graphNodeId);
				for (const dependency of node?.dependencies ?? internals.computedNodes.get(graphNodeId)?.dependencies ?? [])
					visit(dependency.graphNodeId);
				for (const hop of node?.syncHops ?? []) for (const input of hop.asyncFrom) visit(input);
				if (node) ordered.push(node);
			};
			for (const graphNodeId of graphNodeIds) visit(graphNodeId);
			return ordered;
		},
		// `started` hears when the re-asked runs have started, which waits for the refresh code to load.
		refreshAfterWrite(versions, started) {
			const due: RuntimeAsyncComputedNode[] = [];
			for (const [graphNodeId, version] of versions) {
				const node = nodes.get(graphNodeId);
				// A value that ran again since the writes settled already has their answer.
				if (node?.version !== version) continue;
				if (node.phase === NODE_SETTLED) moveNode(node, NODE_PLANNED);
				// A read still in flight from before the writes settled may carry the old answer, so it starts over.
				if (node.phase === NODE_PLANNED || node.phase === NODE_RUNNING) due.push(node);
			}
			if (due.length === 0) {
				withRefresh(() => started?.());
				return Promise.resolve();
			}
			const { settled, flush } = context();
			return new Promise<void>((resolve) => {
				const waiting = new Set(due);
				const heard = (node: RuntimeAsyncComputedNode) => {
					if (!waiting.delete(node)) return;
					// A reader behind an answer a save still holds runs once the hold ends, so it is not waited for here.
					for (const other of waiting)
						if (plane.withInputs([other.graphNodeId]).some((input) => input !== other && input.entryHold?.landed))
							waiting.delete(other);
					if (waiting.size > 0) return;
					settled.delete(heard);
					void (flush?.() ?? Promise.resolve()).then(() => resolve());
				};
				settled.add(heard);
				withRefresh((loaded) => {
					for (const node of due)
						if (node.phase === NODE_PLANNED) loaded.advance(node);
						else if (node.phase === NODE_RUNNING && node.version === versions.get(node.graphNodeId))
							loaded.start(node, (node.snapshot as { readonly key?: unknown }).key);
					started?.();
				});
			});
		},
		holdInputs(factory) {
			const shared = context();
			if (shared.held) return;
			shared.held = factory(shared);
			for (const node of nodes.values()) shared.held.seed(node);
		},
		shownRead(dependencies) {
			return state?.held?.shownRead(dependencies);
		},
		wrote(graphNodeId, path) {
			if (!state) return;
			const { staleDerives } = state;
			staleDerives.delete(graphNodeId);
			for (const cell of state.derivedCells.get(graphNodeId) ?? [])
				if (pathsIntersect(path, cell.path))
					staleDerives.set(cell.graphNodeId, (staleDerives.get(cell.graphNodeId) ?? 0) + 1);
		},
		startDerive(graphNodeId) {
			const stale = state?.staleDerives.get(graphNodeId);
			return () => {
				if (stale === undefined || state!.staleDerives.get(graphNodeId) !== stale) return;
				state!.staleDerives.delete(graphNodeId);
				internals.markDirtyPath(graphNodeId, []);
			};
		},
	};
	return plane;
}
