import type {
	AsyncPlaneContext,
	RuntimeAsyncAnswer,
	RuntimeAsyncComputedNode,
	RuntimeAsyncInput,
} from './graph-async-load.ts';
import { readPath } from './graph-core.ts';
import { isAsyncSnapshotMetaKey } from './graph-scheduler.ts';
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
	/** Kept answers: after `node` lands, keeps the answer it superseded and drops old ones while and once no pinned value reads them. */
	readonly keep: (node: RuntimeAsyncComputedNode, superseded: RuntimeAsyncAnswer | undefined) => void;
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

	// The newest inputs every ancestor has answered, stepping back through kept answers; `false` when none agree.
	const resolveAncestors = (
		ancestors: ReadonlySet<RuntimeAsyncComputedNode>,
	):
		| {
				readonly pins: ReadonlyMap<string, RuntimeAsyncInput>;
				readonly chosen: ReadonlyMap<RuntimeAsyncComputedNode, unknown>;
				readonly rejectedOnly: ReadonlySet<string>;
		  }
		| false => {
		const list = [...ancestors];
		type Candidate = { readonly inputs: ReadonlyArray<RuntimeAsyncInput>; readonly keptValue?: { readonly v: unknown } };
		const candidatesOf = (ancestor: RuntimeAsyncComputedNode): Candidate[] => [
			{ inputs: ancestor.valueInputs ?? [] },
			...(ancestor.priorAnswers ?? []).map((answer) => ({ inputs: answer.inputs, keptValue: { v: answer.value } })),
		];
		const agrees = (pins: ReadonlyMap<string, RuntimeAsyncInput>, inputs: ReadonlyArray<RuntimeAsyncInput>) =>
			inputs.every((input) => {
				const held = pins.get(inputId(input));
				return !held || Object.is(held.value, input.value);
			});
		const assign = (
			index: number,
			pins: Map<string, RuntimeAsyncInput>,
			chosen: Map<RuntimeAsyncComputedNode, unknown>,
			contributedBy: Map<string, RuntimeAsyncComputedNode[]>,
		): boolean => {
			if (index === list.length) return true;
			const ancestor = list[index]!;
			for (const candidate of candidatesOf(ancestor)) {
				if (!agrees(pins, candidate.inputs)) continue;
				const nextPins = new Map(pins);
				const nextContributedBy = new Map(contributedBy);
				for (const input of candidate.inputs) {
					nextPins.set(inputId(input), input);
					nextContributedBy.set(inputId(input), [...(nextContributedBy.get(inputId(input)) ?? []), ancestor]);
				}
				const nextChosen = new Map(chosen);
				if (candidate.keptValue) nextChosen.set(ancestor, candidate.keptValue.v);
				if (assign(index + 1, nextPins, nextChosen, nextContributedBy)) {
					pins.clear();
					for (const [k, v] of nextPins) pins.set(k, v);
					chosen.clear();
					for (const [k, v] of nextChosen) chosen.set(k, v);
					contributedBy.clear();
					for (const [k, v] of nextContributedBy) contributedBy.set(k, v);
					return true;
				}
			}
			return false;
		};
		const pins = new Map<string, RuntimeAsyncInput>();
		const chosen = new Map<RuntimeAsyncComputedNode, unknown>();
		const contributedBy = new Map<string, RuntimeAsyncComputedNode[]>();
		if (!assign(0, pins, chosen, contributedBy)) return false;
		const rejectedOnly = new Set(
			[...contributedBy]
				.filter(([, contributors]) => contributors.every((ancestor) => ancestor.snapshot.status === 'rejected'))
				.map(([id]) => id),
		);
		return { pins, chosen, rejectedOnly };
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
		if (ancestors.size > 1)
			for (const ancestor of ancestors)
				for (const other of ancestors) if (other !== ancestor) (ancestor.readWith ??= new Set()).add(other);

		const resolution = resolveAncestors(ancestors);
		if (!resolution) return false;
		const { pins, chosen, rejectedOnly } = resolution;

		const moved = [...pins.values()].filter((pin) => !Object.is(pin.value, readGraph(pin.graphNodeId, pin.path)));
		if (moved.length === 0 && chosen.size === 0) return undefined;
		for (const ancestor of ancestors)
			if (ancestor.valueInputs?.some((input) => moved.includes(input)) || chosen.has(ancestor)) ancestor.pinned = true;

		const movedIds = new Set(moved.map(inputId));
		// A conservative, coarse hold needs a sibling still live to justify it; a rejected one alone does not.
		const heldWorthy = moved.filter((pin) => !rejectedOnly.has(inputId(pin)));
		const heldWorthyIds = new Set(heldWorthy.map(inputId));
		// A plain derived value over a held input cannot be re-derived with it here.
		const derivesFromMoved = (graphNodeId: string, visited: Set<string>): boolean => {
			const reads = visited.has(graphNodeId) ? [] : (computedNodes.get(graphNodeId)?.dependencies ?? []);
			visited.add(graphNodeId);
			return (
				!reads.some((read) => asyncComputedNodes.has(read.graphNodeId)) &&
				reads.some((read) => heldWorthyIds.has(inputId(read)) || derivesFromMoved(read.graphNodeId, visited))
			);
		};
		for (const dependency of dependencies) {
			if (movedIds.has(inputId(dependency)) || asyncComputedNodes.has(dependency.graphNodeId)) continue;
			const path = dependency.path ?? [];
			const wholeOfHeld = heldWorthy.some(
				(pin) => pin.graphNodeId === dependency.graphNodeId && pin.path.length > path.length && startsWith(pin.path, path),
			);
			if (wholeOfHeld || derivesFromMoved(dependency.graphNodeId, new Set())) return false;
		}
		return (graphNodeId, path = []) => {
			for (const [ancestor, value] of chosen) {
				if (ancestor.graphNodeId !== graphNodeId) continue;
				// Reading an async node goes through its snapshot's meta keys; a kept answer stands in as a fulfilled one.
				const head = path[0];
				if (head === undefined || !isAsyncSnapshotMetaKey(head)) return readPath(value, path);
				if (head === 'value') return readPath(value, path.slice(1));
				if (head === 'status') return 'fulfilled';
				if (head === 'pending') return false;
				return undefined;
			}
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

	// `true` when two input lists share an input and agree on it, `false` when they differ, `undefined` when they share none.
	const agreement = (
		left: ReadonlyArray<RuntimeAsyncInput>,
		right: ReadonlyArray<RuntimeAsyncInput>,
	): boolean | undefined => {
		let shared: boolean | undefined;
		for (const input of left) {
			const other = right.find((candidate) => inputId(candidate) === inputId(input));
			if (!other) continue;
			if (!Object.is(other.value, input.value)) return false;
			shared = true;
		}
		return shared;
	};
	// A value read beside this one still answers the old inputs and not the current ones, so a reader pinned to them reads this answer.
	const stillRead = (node: RuntimeAsyncComputedNode, answer: RuntimeAsyncAnswer): boolean =>
		[...(node.readWith ?? [])].some(
			(sibling) =>
				!!sibling.valueInputs &&
				agreement(answer.inputs, sibling.valueInputs) === true &&
				agreement(node.valueInputs ?? [], sibling.valueInputs) === false,
		);
	const release = (node: RuntimeAsyncComputedNode): void => {
		if (!node.priorAnswers) return;
		const kept = node.priorAnswers.filter((answer) => stillRead(node, answer));
		node.priorAnswers = kept.length > 0 ? kept : undefined;
	};

	return {
		keep(node, superseded) {
			if (superseded) node.priorAnswers = [superseded, ...(node.priorAnswers ?? [])];
			release(node);
			for (const sibling of node.readWith ?? []) release(sibling);
		},
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
