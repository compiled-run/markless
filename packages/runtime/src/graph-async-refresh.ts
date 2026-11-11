import type { RuntimeGraphAsyncSnapshot, RuntimeGraphRead } from './graph.ts';
import {
	NODE_BLOCKED,
	NODE_IDLE,
	NODE_PLANNED,
	NODE_RUNNING,
	NODE_RUNNING_ON_SHOWN,
	NODE_SETTLED,
	type AsyncPlaneState,
	type AsyncRefresh,
	type RunCause,
	type RuntimeAsyncComputedNode,
} from './graph-async-load.ts';

// The most recent fulfilled value and the key it was fetched for, carried through re-runs and failures.
function lastGood(
	snapshot: RuntimeGraphAsyncSnapshot,
): { readonly value: unknown; readonly valueKey: unknown } | undefined {
	if (snapshot.status === 'fulfilled') return { value: snapshot.value, valueKey: snapshot.key };
	if (snapshot.status !== 'idle' && 'valueKey' in snapshot)
		return { value: snapshot.value, valueKey: snapshot.valueKey };
}

/** The refresh half of an async plane: loaded with its first run, failure, handler rejection or entry mark. */
export function bindAsyncRefresh(state: AsyncPlaneState): AsyncRefresh {
	const { asyncComputedNodes: nodes, computedNodes, readGraph, staleDerives, move } = state;

	const publish = (
		node: RuntimeAsyncComputedNode,
		snapshot: RuntimeGraphAsyncSnapshot,
		landed = false,
	): void => {
		const previous = node.snapshot;
		node.snapshot = snapshot;
		// Readers held at the inputs the old value was fetched with move on even when the new value equals it.
		state.landWithoutObservers(() => {
			if (landed && node.pinned) node.pinned = false;
			else if (state.reconcile) return state.reconcile.publishAsync(node, previous);
			state.markDirtyPath(node.graphNodeId, []);
		});
		state.scheduleFlush();
		if (snapshot.status !== 'pending' && heldOnInputs.size > 0)
			void (state.flush?.() ?? Promise.resolve()).then(() => {
				for (const held of heldOnInputs) endEntry(held);
			});
	};

	// Entry marks that outlived their handler: the write reaches them only through an async input still refreshing loudly.
	const heldOnInputs = new Set<RuntimeAsyncComputedNode>();

	const asyncInputWhere = (
		node: RuntimeAsyncComputedNode,
		test: (input: RuntimeAsyncComputedNode) => boolean,
	): RuntimeAsyncComputedNode | undefined => {
		const visited = new Set<string>([node.graphNodeId]);
		const visit = (graphNodeId: string): RuntimeAsyncComputedNode | undefined => {
			if (visited.has(graphNodeId)) return;
			visited.add(graphNodeId);
			const input = nodes.get(graphNodeId);
			if (input) return test(input) ? input : undefined;
			for (const dependency of computedNodes.get(graphNodeId)?.dependencies ?? []) {
				const found = visit(dependency.graphNodeId);
				if (found) return found;
			}
		};
		for (const graphNodeId of [
			...node.dependencies.map((dependency) => dependency.graphNodeId),
			...(node.syncHops ?? []).flatMap((hop) => hop.asyncFrom),
		]) {
			const found = visit(graphNodeId);
			if (found) return found;
		}
	};

	const pendingSnapshot = (
		node: RuntimeAsyncComputedNode,
		version: number,
		key: unknown,
	): RuntimeGraphAsyncSnapshot => {
		const kept = lastGood(node.snapshot);
		return {
			status: 'pending',
			version,
			key,
			value: (node.snapshot as { readonly value?: unknown }).value,
			...(kept && { valueKey: kept.valueKey }),
			...(node.quiet && { quiet: true }),
		};
	};

	const commitDependencyBlock = (
		node: RuntimeAsyncComputedNode,
		status: 'pending' | 'rejected',
		error: unknown,
	): void => {
		if (
			node.phase === NODE_BLOCKED &&
			(status === 'pending'
				? node.snapshot.status === 'pending'
				: node.snapshot.status === 'rejected' && Object.is(node.snapshot.error, error))
		)
			return;

		node.controller?.abort();
		node.controller = undefined;
		move(node, NODE_BLOCKED);
		node.waitingFor = undefined;
		const version = ++node.version;
		const key = (node.snapshot as { readonly key?: unknown }).key;
		publish(
			node,
			status === 'pending'
				? pendingSnapshot(node, version, key)
				: { status, version, key, error, ...lastGood(node.snapshot) },
		);
	};

	const start = (
		node: RuntimeAsyncComputedNode,
		key: unknown,
		read: RuntimeGraphRead = readGraph,
		waiting?: boolean,
		cause?: RunCause,
	): void => {
		node.controller?.abort();
		move(node, waiting ? NODE_RUNNING_ON_SHOWN : NODE_RUNNING);
		node.waitingFor = undefined;
		const inputs = state.held?.capture(node, read);

		const controller = new AbortController();
		const version = ++node.version;
		node.controller = controller;
		// Read in the writing turn: a demanded or entry-held run is loud, and a revalidation is always quiet.
		node.quiet =
			cause === 'revalidate' ||
			(!node.entryHold && cause === 'write' && (state.isUserAction ? !state.isUserAction() : false));
		// A re-run keeps the last good value readable while pending and after a failure (spec D8); a first run has none.
		const kept = lastGood(node.snapshot);
		publish(node, pendingSnapshot(node, version, key));

		const land = (snapshot: Exclude<RuntimeGraphAsyncSnapshot, { readonly status: 'idle' }>): void => {
			if (node.version !== version) return;
			const landed = snapshot.status !== 'rejected';
			if (landed) {
				if (inputs) {
					const superseded = node.valueInputs && {
						value: (node.snapshot as { readonly value?: unknown }).value,
						inputs: node.valueInputs,
					};
					node.valueInputs = inputs;
					state.held?.keep(node, superseded);
				}
				node.servedKey = undefined;
			}
			// Only a run on shown inputs lands pending.
			move(node, snapshot.status === 'pending' ? NODE_BLOCKED : NODE_SETTLED);
			publish(node, node.quiet ? { ...snapshot, quiet: true } : snapshot, landed);
		};
		const commitRejected = (error: unknown): void =>
			land({ status: 'rejected', version, key, error, ...kept });
		try {
			Promise.resolve(node.run({ key, signal: controller.signal, read })).then(
				(value) =>
					land(
						node.phase === NODE_RUNNING_ON_SHOWN
							? { status: 'pending', version, key, value, valueKey: key }
							: { status: 'fulfilled', version, key, value },
					),
				commitRejected,
			);
		} catch (error) {
			commitRejected(error);
		}
	};

	const advance = (node: RuntimeAsyncComputedNode, cause?: RunCause): void => {
		// Walk through sync computeds to the async nodes whose snapshots can block this runner.
		const visited = new Set<string>([node.graphNodeId]);
		let blocked: RuntimeAsyncComputedNode | undefined;
		let shown = true;
		let staleDerive = false;
		const visit = (graphNodeId: string): void => {
			if (visited.has(graphNodeId)) return;
			visited.add(graphNodeId);
			if (staleDerives.has(graphNodeId)) staleDerive = true;
			const dependency = nodes.get(graphNodeId);
			if (dependency) {
				// A planned input starts first, so this reader waits for its answer instead of running on the old one.
				if (dependency.phase === NODE_PLANNED) demand(dependency, cause);
				if (dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending') {
					blocked = dependency;
					if (!dependency.valueInputs) shown = false;
					demand(dependency, cause);
				} else if (!blocked && dependency.snapshot.status === 'rejected') {
					blocked = dependency;
					if (!dependency.valueInputs) shown = false;
				}
				return;
			}
			for (const dependency of computedNodes.get(graphNodeId)?.dependencies ?? [])
				visit(dependency.graphNodeId);
		};
		for (const dependency of node.dependencies) visit(dependency.graphNodeId);
		for (const hop of node.syncHops ?? []) for (const graphNodeId of hop.asyncFrom) visit(graphNodeId);
		const pinsPastFailure = blocked?.snapshot.status === 'rejected' && shown && !node.boundaryGate;
		// A rejected blocker with a pinnable last-good value pins like a pending one (graph-held.ts `rejectedOnly`).
		if (blocked && shown && (blocked.snapshot.status !== 'rejected' || pinsPastFailure) && state.held?.startOnShownInputs(node)) return;
		// A sibling's failed refresh never rejects a reader whose pinned key did not move.
		if (pinsPastFailure) return;
		if (!blocked && staleDerive) {
			commitDependencyBlock(node, 'pending', undefined);
			return;
		}
		if (blocked) {
			commitDependencyBlock(
				node,
				blocked.snapshot.status === 'rejected' ? 'rejected' : 'pending',
				(blocked.snapshot as { readonly error?: unknown }).error,
			);
			return;
		}

		const nextKey = node.key(readGraph);
		if (
			node.phase >= NODE_RUNNING &&
			Object.is((node.snapshot as { readonly key?: unknown }).key, nextKey)
		)
			return;

		start(node, nextKey, readGraph, undefined, cause);
	};

	const demand = (node: RuntimeAsyncComputedNode, cause?: RunCause): void => {
		if (node.phase <= NODE_PLANNED) advance(node, cause);
	};

	// Same key, so the real run the write starts replaces this pending snapshot with no gap.
	const markEntry = (node: RuntimeAsyncComputedNode): void => {
		if (node.entryHold || node.phase === NODE_IDLE || node.snapshot.status === 'pending')
			return;
		const previous = node.snapshot;
		const version = ++node.version;
		node.entryHold = { version, previous };
		node.quiet = false;
		publish(node, pendingSnapshot(node, version, (previous as { readonly key?: unknown }).key));
		// A callback prop runs under a held flush (resume-events.ts `invokeSymbol`); flush past it.
		void state.flush?.();
	};

	const endEntry = (node: RuntimeAsyncComputedNode, unwritten?: boolean): void => {
		const hold = node.entryHold;
		if (!hold) return;
		// A cell-backed computed between the write and this key only recomputes in the next flush.
		if (!unwritten && node.version === hold.version && state.hasPendingFlush?.()) {
			void state.flush?.().then(() => {
				if (node.entryHold === hold) endEntry(node);
			});
			return;
		}
		if (
			node.version === hold.version &&
			asyncInputWhere(node, (input) => input.snapshot.status === 'pending' && input.snapshot.quiet !== true)
		) {
			heldOnInputs.add(node);
			return;
		}
		const outlived = heldOnInputs.delete(node);
		node.entryHold = undefined;
		if (node.version !== hold.version) return;
		// Below a failed link the value goes where any reader of a failed input goes.
		if (outlived && asyncInputWhere(node, (input) => input.snapshot.status === 'rejected')) advance(node);
		if (node.version !== hold.version) return;
		// A new version, so the block settles on it: its input's failure was held back while this value was busy.
		publish(node, outlived ? ({ ...hold.previous, version: ++node.version } as RuntimeGraphAsyncSnapshot) : hold.previous);
		void state.flush?.();
	};

	return {
		advance,
		start,
		markEntry,
		endEntry,
		fail(node, error) {
			node.controller?.abort();
			node.controller = undefined;
			// A planned or blocked value keeps waiting for its demand or its input.
			if (node.phase === NODE_IDLE || node.phase >= NODE_RUNNING) move(node, NODE_SETTLED);
			const version = ++node.version;
			const key = (node.snapshot as { readonly key?: unknown }).key;
			publish(node, { status: 'rejected', version, key, error, ...lastGood(node.snapshot) });
		},
	};
}
