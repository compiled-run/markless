import type {
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from './graph.ts';
import { readPath } from './graph-core.ts';
import type { RuntimeComputedNode } from './graph-computed.ts';

/** One input a key read, with the value it had when the run started. */
export type RuntimeAsyncInput = {
	readonly graphNodeId: string;
	readonly path: ReadonlyArray<string>;
	readonly value: unknown;
};

export type RuntimeAsyncComputedNode = RuntimeGraphAsyncComputed & {
	controller?: AbortController;
	gate: number;
	snapshot: RuntimeGraphAsyncSnapshot;
	version: number;
	/** The inputs the shown value was fetched with. */
	valueInputs?: ReadonlyArray<RuntimeAsyncInput>;
	/** A reader read an input as `valueInputs` holds it, so the landing must reach that reader. */
	pinned?: boolean;
	/** The key a served value was fetched with; its snapshot carries none. */
	servedKey?: { readonly key: unknown };
	/** The key of the run on held inputs, in flight or landed, while its async inputs still refresh. */
	waitingFor?: { readonly key: unknown };
};

export const ASYNC_SNAPSHOT_META_KEYS = new Set(['status', 'version', 'key', 'error', 'value']);

/**
 * The async half of the derived-reconcile plane, when one is installed. Without
 * it a snapshot commit dirties the whole node.
 */
type AsyncReconcile = {
	readonly reconcile?: {
		readonly publishAsync: (
			node: RuntimeAsyncComputedNode,
			previous: RuntimeGraphAsyncSnapshot,
		) => void;
	};
};

export function createRuntimeAsyncComputedNodes(
	asyncComputedInput: ReadonlyArray<RuntimeGraphAsyncComputed> | undefined,
): Map<string, RuntimeAsyncComputedNode> {
	const asyncComputedNodes = new Map<string, RuntimeAsyncComputedNode>();
	for (const asyncComputed of asyncComputedInput ?? []) {
		const initialSnapshot: RuntimeGraphAsyncSnapshot = asyncComputed.initialSnapshot ?? {
			status: 'idle',
			version: 0,
		};
		asyncComputedNodes.set(asyncComputed.graphNodeId, {
			...asyncComputed,
			gate: initialSnapshot.status === 'pending' ? 1 : 0,
			snapshot: initialSnapshot,
			version: initialSnapshot.version,
		});
	}
	return asyncComputedNodes;
}

export function readAsyncComputedNode(
	node: RuntimeAsyncComputedNode,
	path: ReadonlyArray<string>,
	demand: () => void,
): unknown {
	demand();
	const head = path[0];
	if (head === undefined || ASYNC_SNAPSHOT_META_KEYS.has(head)) {
		return readPath(node.snapshot, path);
	}
	return readPath((node.snapshot as { readonly value?: unknown }).value, path);
}

export function demandAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	// A payload-planned pending snapshot still needs its runner started on
	// first demand; otherwise only idle computeds start (startAsyncComputed
	// clears the needs-runner flag itself).
	if (input.node.gate !== 1 && input.node.snapshot.status !== 'idle') return;

	advanceAsyncComputed(input);
}

export function invalidateAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	if (input.node.snapshot.status === 'idle') return;

	advanceAsyncComputed(input);
}

// A reset re-runs a rejected value even though its key has not changed.
export function retryAsyncComputed(input: Parameters<typeof advanceAsyncComputed>[0]): void {
	input.node.gate = 1;
	advanceAsyncComputed(input);
}

// The most recent fulfilled value and the key it was fetched for, carried through re-runs and failures.
function lastGood(
	snapshot: RuntimeGraphAsyncSnapshot,
): { readonly value: unknown; readonly valueKey: unknown } | undefined {
	if (snapshot.status === 'fulfilled') return { value: snapshot.value, valueKey: snapshot.key };
	if (snapshot.status !== 'idle' && 'valueKey' in snapshot)
		return { value: snapshot.value, valueKey: snapshot.valueKey };
}

function advanceAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly demandAsyncComputed: (node: RuntimeAsyncComputedNode) => void;
	readonly readGraph: RuntimeGraphRead;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	// Sync computeds have no settlement state, so walk through them until the
	// gate reaches the async nodes whose snapshots can block this runner.
	const visited = new Set<string>([input.node.graphNodeId]);
	let blocked: RuntimeAsyncComputedNode | undefined;
	let shown = true;
	const visit = (graphNodeId: string): void => {
		if (visited.has(graphNodeId)) return;
		visited.add(graphNodeId);
		const dependency = input.asyncComputedNodes.get(graphNodeId);
		if (dependency) {
			if (dependency.snapshot.status === 'idle' || dependency.snapshot.status === 'pending') {
				blocked = dependency;
				if (!dependency.valueInputs) shown = false;
				input.demandAsyncComputed(dependency);
			} else if (!blocked && dependency.snapshot.status === 'rejected') blocked = dependency;
			return;
		}
		for (const dependency of input.computedNodes.get(graphNodeId)?.dependencies ?? [])
			visit(dependency.graphNodeId);
	};
	for (const dependency of input.node.dependencies) visit(dependency.graphNodeId);
	if (blocked && blocked.snapshot.status === 'pending' && shown && startOnShownInputs(input))
		return;
	if (blocked) {
		commitDependencyBlock(
			input,
			blocked.snapshot.status === 'rejected' ? 'rejected' : 'pending',
			(blocked.snapshot as { readonly error?: unknown }).error,
		);
		return;
	}

	const nextKey = input.node.key(input.readGraph);
	if (
		!input.node.gate &&
		input.node.snapshot.status !== 'idle' &&
		Object.is((input.node.snapshot as { readonly key?: unknown }).key, nextKey)
	) {
		return;
	}

	startAsyncComputed({ ...input, key: nextKey });
}

// While its async inputs refresh, a value whose own key moved runs at once on their shown inputs, then keeps waiting.
function startOnShownInputs(input: Parameters<typeof advanceAsyncComputed>[0]): boolean {
	const kept = lastGood(input.node.snapshot);
	if (!kept || !input.node.valueInputs) return false;
	const read = shownReadFor(input.node.dependencies, input);
	if (read === false) return false;
	const key = input.node.key(read ?? input.readGraph);
	if (keysEqual(key, input.node.servedKey ? input.node.servedKey.key : kept.valueKey)) return false;
	if (input.node.waitingFor && keysEqual(key, input.node.waitingFor.key)) return true;
	startAsyncComputed({ ...input, key, read: read ?? input.readGraph, waiting: true });
	input.node.waitingFor = { key };
	return true;
}

function keysEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
	return left.every((value, index) => Object.is(value, right[index]));
}

type GraphNodes = {
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly readGraph: RuntimeGraphRead;
};

// What a key read, closed through async inputs.
export function keyInputs(
	dependencies: RuntimeGraphAsyncComputed['dependencies'],
	nodes: Omit<GraphNodes, 'readGraph'>,
	read: RuntimeGraphRead,
	seen = new Set<string>(),
): RuntimeAsyncInput[] {
	const inputs: RuntimeAsyncInput[] = [];
	for (const dependency of dependencies) {
		const path = dependency.path ?? [];
		const asyncInput = nodes.asyncComputedNodes.get(dependency.graphNodeId);
		if (asyncInput) {
			inputs.push(...(asyncInput.valueInputs ?? []));
			continue;
		}
		inputs.push({ graphNodeId: dependency.graphNodeId, path, value: read(dependency.graphNodeId, path) });
		const computed = nodes.computedNodes.get(dependency.graphNodeId);
		if (computed && !seen.has(computed.graphNodeId)) {
			seen.add(computed.graphNodeId);
			inputs.push(...keyInputs(computed.dependencies, nodes, read, seen));
		}
	}
	return inputs;
}

// A served value was fetched with the inputs the page was served with.
export function seedValueInputs(node: RuntimeAsyncComputedNode, nodes: Omit<GraphNodes, 'readGraph'>, peek: RuntimeGraphRead): void {
	if (node.valueInputs || node.snapshot.status !== 'fulfilled') return;
	node.valueInputs = [];
	for (const dependency of node.dependencies) {
		const asyncInput = nodes.asyncComputedNodes.get(dependency.graphNodeId);
		if (asyncInput) seedValueInputs(asyncInput, nodes, peek);
	}
	node.valueInputs = keyInputs(node.dependencies, nodes, peek);
	if (node.snapshot.key == null) node.servedKey = { key: node.key(peek) };
}

const inputId = (input: { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> }) =>
	`${input.graphNodeId}\u0000${(input.path ?? []).join('\u0000')}`;

const startsWith = (path: ReadonlyArray<string>, prefix: ReadonlyArray<string>) =>
	prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);

// Inputs of a refreshing value's key answer as its shown value was fetched; `false` means the reader would mix.
export function shownReadFor(
	dependencies: ReadonlyArray<{ readonly graphNodeId: string; readonly path?: ReadonlyArray<string> }>,
	nodes: GraphNodes,
): RuntimeGraphRead | false | undefined {
	const { asyncComputedNodes, computedNodes, readGraph } = nodes;
	const ancestors = new Set<RuntimeAsyncComputedNode>();
	const seen = new Set<string>();
	const visit = (graphNodeId: string): void => {
		if (seen.has(graphNodeId)) return;
		seen.add(graphNodeId);
		const asyncNode = asyncComputedNodes.get(graphNodeId);
		if (asyncNode) ancestors.add(asyncNode);
		else for (const dependency of computedNodes.get(graphNodeId)?.dependencies ?? []) visit(dependency.graphNodeId);
	};
	for (const dependency of dependencies) visit(dependency.graphNodeId);

	const pins = new Map<string, RuntimeAsyncInput>();
	for (const ancestor of ancestors)
		for (const input of ancestor.valueInputs ?? []) {
			const held = pins.get(inputId(input));
			if (held && !Object.is(held.value, input.value)) return false;
			pins.set(inputId(input), input);
		}
	const moved = [...pins.values()].filter((pin) => !Object.is(pin.value, readGraph(pin.graphNodeId, pin.path)));
	if (moved.length === 0) return undefined;
	for (const ancestor of ancestors)
		if (ancestor.valueInputs?.some((input) => moved.includes(input))) ancestor.pinned = true;

	const movedIds = new Set(moved.map(inputId));
	// A plain derived value over a held input cannot be re-derived with it here.
	const derivesFromMoved = (graphNodeId: string, visited: Set<string>): boolean => {
		const reads = visited.has(graphNodeId) ? [] : (computedNodes.get(graphNodeId)?.dependencies ?? []);
		visited.add(graphNodeId);
		return (
			!reads.some((read) => asyncComputedNodes.has(read.graphNodeId)) &&
			reads.some((read) => movedIds.has(inputId(read)) || derivesFromMoved(read.graphNodeId, visited))
		);
	};
	for (const dependency of dependencies) {
		if (movedIds.has(inputId(dependency)) || asyncComputedNodes.has(dependency.graphNodeId)) continue;
		const path = dependency.path ?? [];
		const wholeOfHeld = moved.some(
			(pin) => pin.graphNodeId === dependency.graphNodeId && pin.path.length > path.length && startsWith(pin.path, path),
		);
		if (wholeOfHeld || derivesFromMoved(dependency.graphNodeId, new Set())) return false;
	}
	return (graphNodeId, path = []) => {
		const pin = moved.find((held) => held.graphNodeId === graphNodeId && startsWith(path, held.path));
		return pin ? readPath(pin.value, path.slice(pin.path.length)) : readGraph(graphNodeId, path);
	};
}

function commitDependencyBlock(
	input: AsyncReconcile & {
		readonly node: RuntimeAsyncComputedNode;
		readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
		readonly scheduleFlush: () => void;
	},
	status: 'pending' | 'rejected',
	error: unknown,
): void {
	if (
		input.node.gate === 2 &&
		(status === 'pending' ||
			(input.node.snapshot.status === 'rejected' &&
				Object.is(input.node.snapshot.error, error)))
	) {
		return;
	}

	input.node.controller?.abort();
	input.node.controller = undefined;
	input.node.gate = 2;
	input.node.waitingFor = undefined;
	const version = ++input.node.version;
	const key = (input.node.snapshot as { readonly key?: unknown }).key;
	const kept = lastGood(input.node.snapshot);
	publish(
		input,
		status === 'pending'
			? {
					status,
					version,
					key,
					value: (input.node.snapshot as { readonly value?: unknown }).value,
					...(kept && { valueKey: kept.valueKey }),
				}
			: { status, version, key, error, ...kept },
	);
}

function startAsyncComputed(input: AsyncReconcile & {
	readonly node: RuntimeAsyncComputedNode;
	readonly computedNodes: ReadonlyMap<string, RuntimeComputedNode>;
	readonly asyncComputedNodes: ReadonlyMap<string, RuntimeAsyncComputedNode>;
	readonly key: unknown;
	readonly readGraph: RuntimeGraphRead;
	/** The read the key was taken with, when inputs are held at their shown values. */
	readonly read?: RuntimeGraphRead;
	/** Its inputs still refresh, so it keeps waiting for them after it lands. */
	readonly waiting?: boolean;
	readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
	readonly scheduleFlush: () => void;
}): void {
	input.node.controller?.abort();
	input.node.gate = 0;
	input.node.waitingFor = undefined;
	const read = input.read ?? input.readGraph;
	const inputs = keyInputs(input.node.dependencies, input, read);

	const controller = new AbortController();
	const version = ++input.node.version;
	input.node.controller = controller;
	// A re-run keeps the last good value addressable while pending and after a
	// failure (spec D8 / Solid 2 `latest`); a first run has none, so reads answer undefined.
	const kept = lastGood(input.node.snapshot);
	publish(input, {
		status: 'pending',
		version,
		key: input.key,
		value: (input.node.snapshot as { readonly value?: unknown }).value,
		...(kept && { valueKey: kept.valueKey }),
	});

	const commit = (snapshot: RuntimeGraphAsyncSnapshot): void => {
		if (input.node.version !== version) return;

		const landed = snapshot.status === 'fulfilled';
		if (landed) {
			input.node.valueInputs = inputs;
			input.node.servedKey = undefined;
		}
		publish(input, snapshot, landed);
	};
	const commitRejected = (error: unknown): void =>
		commit({ status: 'rejected', version, key: input.key, error, ...kept });
	const commitValue = (value: unknown): void => {
		if (!input.waiting) return commit({ status: 'fulfilled', version, key: input.key, value });
		if (input.node.version !== version) return;
		input.node.valueInputs = inputs;
		input.node.servedKey = undefined;
		input.node.gate = 2;
		publish(input, { status: 'pending', version, key: input.key, value, valueKey: input.key }, true);
	};

	try {
		Promise.resolve(
			input.node.run({ key: input.key, signal: controller.signal, read }),
		).then(commitValue, commitRejected);
	} catch (error) {
		commitRejected(error);
	}
}

function publish(
	input: AsyncReconcile & {
		readonly node: RuntimeAsyncComputedNode;
		readonly markDirtyPath: (graphNodeId: string, path: ReadonlyArray<string>) => void;
		readonly scheduleFlush: () => void;
	},
	snapshot: RuntimeGraphAsyncSnapshot,
	landed = false,
): void {
	const previous = input.node.snapshot;
	input.node.snapshot = snapshot;
	// Readers held at the inputs the old value was fetched with move on even when the new value equals it.
	if (landed && input.node.pinned) input.node.pinned = false;
	else if (input.reconcile) {
		input.reconcile.publishAsync(input.node, previous);
		input.scheduleFlush();
		return;
	}
	input.markDirtyPath(input.node.graphNodeId, []);
	input.scheduleFlush();
}
