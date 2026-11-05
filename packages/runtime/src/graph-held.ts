import type { AsyncPlaneContext, RuntimeAsyncComputedNode, RuntimeAsyncInput } from './graph-async.ts';
import { readPath } from './graph-core.ts';
import type {
	RuntimeGraphAsyncComputed,
	RuntimeGraphComputedDependency,
	RuntimeGraphRead,
} from './graph.ts';

/** Matched values: what an async value's shown result was fetched with, and readers held at it while it refreshes. */
export type HeldInputsPlane = {
	readonly capture: (
		node: RuntimeAsyncComputedNode,
		read: RuntimeGraphRead,
	) => ReadonlyArray<RuntimeAsyncInput>;
	readonly seed: (node: RuntimeAsyncComputedNode) => void;
	readonly startOnShownInputs: (node: RuntimeAsyncComputedNode) => boolean;
	readonly shownRead: (
		dependencies: ReadonlyArray<RuntimeGraphComputedDependency>,
	) => RuntimeGraphRead | false | undefined;
};

export type HeldInputsPlaneFactory = (context: AsyncPlaneContext) => HeldInputsPlane;

const inputId = (input: { readonly graphNodeId: string; readonly path?: ReadonlyArray<string> }) =>
	`${input.graphNodeId}\u0000${(input.path ?? []).join('\u0000')}`;

const startsWith = (path: ReadonlyArray<string>, prefix: ReadonlyArray<string>) =>
	prefix.length <= path.length && prefix.every((segment, index) => path[index] === segment);

function keysEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
	return left.every((value, index) => Object.is(value, right[index]));
}

// The latest kept value's key, through re-runs and failures.
const keptKey = (node: RuntimeAsyncComputedNode): { readonly key: unknown } | undefined => {
	const snapshot = node.snapshot as { readonly status: string; readonly key?: unknown; readonly valueKey?: unknown };
	if (snapshot.status === 'fulfilled') return { key: snapshot.key };
	if ('valueKey' in snapshot) return { key: snapshot.valueKey };
};

export const createHeldInputsPlane: HeldInputsPlaneFactory = (context) => {
	const { asyncComputedNodes, computedNodes, readGraph } = context;

	// What a key read, closed through async inputs.
	const keyInputs = (
		dependencies: RuntimeGraphAsyncComputed['dependencies'],
		read: RuntimeGraphRead,
		seen = new Set<string>(),
	): RuntimeAsyncInput[] => {
		const inputs: RuntimeAsyncInput[] = [];
		for (const dependency of dependencies) {
			const path = dependency.path ?? [];
			const asyncInput = asyncComputedNodes.get(dependency.graphNodeId);
			if (asyncInput) {
				inputs.push(...(asyncInput.valueInputs ?? []));
				continue;
			}
			inputs.push({ graphNodeId: dependency.graphNodeId, path, value: read(dependency.graphNodeId, path) });
			const computed = computedNodes.get(dependency.graphNodeId);
			if (computed && !seen.has(computed.graphNodeId)) {
				seen.add(computed.graphNodeId);
				inputs.push(...keyInputs(computed.dependencies, read, seen));
			}
		}
		return inputs;
	};

	// Inputs of a refreshing value's key answer as its shown value was fetched; `false` means the reader would mix.
	const shownRead: HeldInputsPlane['shownRead'] = (dependencies) => {
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
	};

	// What the page was served with: no initializer runs and no async value starts.
	const peek: RuntimeGraphRead = (graphNodeId, path = []) => {
		const asyncNode = asyncComputedNodes.get(graphNodeId);
		return asyncNode ? context.peek(asyncNode, path) : readPath(context.cells.get(graphNodeId), path);
	};

	// A served value was fetched with the inputs the page was served with.
	const seed = (node: RuntimeAsyncComputedNode): void => {
		if (node.valueInputs || node.snapshot.status !== 'fulfilled') return;
		node.valueInputs = [];
		for (const dependency of node.dependencies) {
			const asyncInput = asyncComputedNodes.get(dependency.graphNodeId);
			if (asyncInput) seed(asyncInput);
		}
		node.valueInputs = keyInputs(node.dependencies, peek);
		if (node.snapshot.key == null) node.servedKey = { key: node.key(peek) };
	};

	return {
		capture: (node, read) => keyInputs(node.dependencies, read),
		seed,
		shownRead,
		// While its async inputs refresh, a value whose own key moved runs at once on their shown inputs, then keeps waiting.
		startOnShownInputs(node) {
			const kept = keptKey(node);
			if (!kept || !node.valueInputs) return false;
			const read = shownRead(node.dependencies);
			if (read === false) return false;
			const key = node.key(read ?? readGraph);
			if (keysEqual(key, (node.servedKey ?? kept).key)) return false;
			if (node.waitingFor && keysEqual(key, node.waitingFor.key)) return true;
			context.start(node, key, read ?? readGraph, true);
			node.waitingFor = { key };
			return true;
		},
	};
};
