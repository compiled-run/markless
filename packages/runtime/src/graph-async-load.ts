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

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	gate: number;
	snapshot: RuntimeGraphAsyncSnapshot;
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
	/** A handler that writes one of this node's key inputs marked it busy before running; cleared on `endEntry`, or left for the real run to clear once it lands. */
	entryHold?: { readonly version: number; readonly previous: RuntimeGraphAsyncSnapshot };
	/** Set when the run that is in flight started outside a user action; carried onto every snapshot that run publishes. */
	quiet?: boolean;
	/** The run in flight started inside a user action, or the node's first run did; the resume cache never keeps such a value. */
	action?: boolean;
	/** The node's first run started inside a user action. */
	createdByAction?: true;
};

/** What started a run: a graph write, or the resume cache re-checking a value it seeded; neither for a plain read. */
export type RunCause = 'write' | 'revalidate';

/** What the async plane shares with the held-inputs plane. */
export type AsyncPlaneContext = AsyncComputedPlaneInternals & {
	readonly asyncComputedNodes: Map<string, RuntimeAsyncComputedNode>;
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
	readonly derivedCells: Map<string, Array<{ readonly graphNodeId: string; readonly path: ReadonlyArray<string> }>>;
	readonly staleDerives: Map<string, number>;
};

/** Runs, refresh scheduling, entry marks and failures: `@markless/runtime/graph-async-refresh`. */
export type AsyncRefresh = {
	readonly advance: (node: RuntimeAsyncComputedNode, cause?: RunCause) => void;
	readonly start: AsyncPlaneContext['start'];
	readonly markEntry: (node: RuntimeAsyncComputedNode) => void;
	readonly endEntry: (node: RuntimeAsyncComputedNode) => void;
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
		gate: snapshot.status === 'pending' ? 1 : 0,
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

/**
 * Async computeds as an installable plane, holding only what a page with settled values reads.
 * `refresh` answers the refresh half, or a promise of it: calls made while it loads wait and run in order,
 * each with the user-action state it was made in.
 */
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
	// Built on first use: a page whose values all arrived settled may never need it.
	const context = (): AsyncPlaneState =>
		(state ??= {
			...internals,
			asyncComputedNodes: nodes,
			derivedCells: new Map(),
			staleDerives: new Map(),
			start: (...args) => bound!.start(...args),
			peek,
			isUserAction:
				internals.isUserAction && (() => replaying ?? internals.isUserAction!()),
		});
	const withRefresh = (run: (bound: AsyncRefresh) => void): void => {
		if (bound) return run(bound);
		const byAction = context().isUserAction?.();
		const replay = (loaded: AsyncRefresh) => {
			replaying = byAction;
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
	const forward = (graphNodeId: string, call: (bound: AsyncRefresh, node: RuntimeAsyncComputedNode) => void): void => {
		const node = nodes.get(graphNodeId);
		if (node) withRefresh((loaded) => call(loaded, node));
	};

	return {
		nodes,
		read(node, path) {
			// A payload-planned pending snapshot still needs its runner started on first demand; otherwise only idle computeds start.
			if (node.gate === 1 || node.snapshot.status === 'idle') withRefresh((loaded) => loaded.advance(node));
			return peek(node, path);
		},
		invalidate(node) {
			if (node.snapshot.status !== 'idle') withRefresh((loaded) => loaded.advance(node, 'write'));
		},
		markEntry(graphNodeId) {
			forward(graphNodeId, (loaded, node) => loaded.markEntry(node));
		},
		endEntry(graphNodeId) {
			forward(graphNodeId, (loaded, node) => loaded.endEntry(node));
		},
		failHandler(graphNodeId, error) {
			forward(graphNodeId, (loaded, node) => loaded.fail(node, error));
		},
		define(asyncComputed) {
			const node = createNode(asyncComputed);
			add(node);
			state?.held?.seed(node);
		},
		rerun(graphNodeId, revalidate) {
			const node = nodes.get(graphNodeId);
			if (node?.snapshot.status !== (revalidate ? 'fulfilled' : 'rejected')) return false;
			// A reset re-runs a rejected value, and a seeded value revalidates, though the key has not changed.
			node.gate = 1;
			withRefresh((loaded) => loaded.advance(node, revalidate ? 'revalidate' : undefined));
			return true;
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
}
