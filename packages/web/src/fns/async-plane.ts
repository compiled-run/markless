import { createAsyncPlane, type AsyncRefreshModule } from '@markless/runtime/graph-async-load';
import type {
	AsyncComputedPlane,
	AsyncComputedPlaneFactory,
	RuntimeGraph,
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from '@markless/runtime';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type { ResumePayloadGraphInput } from '../payload-graph-construct.ts';
import { asyncPlanes } from '../reconcile-plane-slot.ts';
import { ASYNC_BOUNDARY_ARM } from '@markless/serializer/async-boundary-arm';
import type {
	ResumeArmRange,
	ResumeAsyncBoundaryRecord,
	ResumeDomComment,
} from '../resume-types.ts';
import type { BusyBoundary, busyElements } from './busy-elements.ts';

// A page whose async values all arrived settled loads the refresh half with its first refresh, failure, handler rejection or entry mark.
let refresh: AsyncRefreshModule | Promise<AsyncRefreshModule> | undefined;
const loadRefresh = () =>
	(refresh ??= import('./async-refresh.ts').then((module) => (refresh = module)));

// Methods, not properties: what a page never calls costs it nothing to install.
const parts = {
	async(internals, asyncComputed) {
		return createAsyncPlane(internals, asyncComputed, loadRefresh);
	},
	fromPayload(input: ResumePayloadGraphInput, graphRef: () => RuntimeGraph, decode: Decode) {
		const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);
		return Promise.all(
			input.state.computed
				.filter((computed) => computed.async === true && !!runnerSymbols[computed.graphNodeId])
				.map((computed) =>
					asyncComputedFromRecord(
						computed,
						runnerSymbols[computed.graphNodeId]!,
						input,
						graphRef,
						decode,
						input.state.computed,
					),
				),
		);
	},
	fromRecord(...args: Parameters<typeof asyncComputedFromRecord>) {
		return asyncComputedFromRecord(...args);
	},
	awaits(...args: Parameters<typeof awaitsAsyncValue>) {
		return awaitsAsyncValue(...args);
	},
	awaitsAncestor(...args: Parameters<typeof awaitsAsyncAncestor>) {
		return awaitsAsyncAncestor(...args);
	},
	busy: {
		note(...args: Parameters<typeof note>) {
			note(...args);
		},
		set(...args: Parameters<typeof set>) {
			set(...args);
		},
		apply(...args: Parameters<typeof apply>) {
			apply(...args);
		},
		settleRange(...args: Parameters<typeof settleRange>) {
			return settleRange(...args);
		},
		shown(...args: Parameters<typeof shown>) {
			shown(...args);
		},
	},
} satisfies AsyncPlaneSlot;

export function installMarklessAsyncPlane(): void {
	Object.assign(asyncPlanes, parts);
}

type DependencyRecord = {
	readonly graphNodeId: string;
	readonly async?: boolean;
	readonly dependencies?: ReadonlyArray<{ readonly graphNodeId: string }>;
};

// Spec 03: a sync computed over an unsettled async ancestor stays pending instead of running.
function awaitsAsyncAncestor(
	computed: Pick<DependencyRecord, 'dependencies'>,
	records: ReadonlyArray<DependencyRecord>,
	graph: RuntimeGraph,
	visited = new Set<string>(),
): boolean {
	for (const { graphNodeId } of computed.dependencies ?? []) {
		if (visited.has(graphNodeId)) continue;
		visited.add(graphNodeId);
		const record = records.find((candidate) => candidate.graphNodeId === graphNodeId);
		if (record?.async === true) {
			if (!hasReadableValue(graph.read(graphNodeId, []))) return true;
		} else if (record && awaitsAsyncAncestor(record, records, graph, visited)) return true;
	}
	return false;
}

// A re-run and a failed refresh keep the prior settled value readable (spec D8), so only a first run or first failure has nothing to read.
function hasReadableValue(snapshot: unknown): boolean {
	const { status, value } =
		(snapshot as { readonly status?: unknown; readonly value?: unknown } | null) ?? {};
	return status === 'fulfilled' || ((status === 'pending' || status === 'rejected') && value !== undefined);
}


// A first render skips a sync computed while an async value it derives from has nothing to read yet.
function awaitsAsyncValue(
	state: Pick<ProtocolStatePayload, 'computed'>,
	graphNodeId: string,
	read: RuntimeGraphRead,
): boolean | undefined {
	return state.computed
		.find((record) => record.graphNodeId === graphNodeId)
		?.asyncFrom?.some((id) => {
			const snapshot = read(id, []) as { status?: unknown; value?: unknown } | undefined;
			return snapshot?.status !== 'fulfilled' && snapshot?.value === undefined;
		});
}

type Decode = (payload: SerializedGraphPayload) => Promise<unknown>;

async function asyncComputedFromRecord(
	computed: ProtocolStatePayload['computed'][number],
	runnerSymbolId: string,
	input: Pick<ResumePayloadGraphInput, 'root' | 'loadSymbol'>,
	graphRef: () => RuntimeGraph,
	decode?: Decode,
	records?: ProtocolStatePayload['computed'],
): Promise<RuntimeGraphAsyncComputed> {
	const dependencies = computed.dependencies ?? [];
	// A value with no settled answer runs as soon as it is read, so its refresh half is there before the graph is.
	if (computed.snapshot?.status !== 'fulfilled' && computed.snapshot?.status !== 'rejected') await loadRefresh();
	const syncHops =
		records?.some((record) => record.asyncFrom) &&
		dependencies.flatMap(({ graphNodeId }) => {
			const hop = records.find((record) => record.graphNodeId === graphNodeId && record.async === false);
			return hop?.asyncFrom
				? [{ graphNodeId, dependencies: hop.dependencies ?? [], asyncFrom: hop.asyncFrom }]
				: [];
		});
	const initialSnapshot =
		computed.snapshot && (await deserializeAsyncComputedSnapshot(computed.snapshot, decode));
	return {
		graphNodeId: computed.graphNodeId,
		dependencies,
		...(syncHops && syncHops.length > 0 && { syncHops }),
		...(computed.boundaryGate && { boundaryGate: true as const }),
		initialSnapshot,
		key: (read: RuntimeGraphRead) => {
			const values = dependencies.map((dependency) =>
				read(dependency.graphNodeId, dependency.path),
			);
			const [only] = values;
			// An object changed in place keeps its identity, so it is never the same key twice.
			return values.length > 1 || Object(only) === only ? values : only;
		},
		run: async ({ key, signal, read }) => {
			const graph = graphRef();
			let runner = await input.loadSymbol(runnerSymbolId);
			// A bound runner names edges, never a row; the node it settles names the row, as a bound derive's does.
			if (computed.graphNodeId.includes('r:'))
				runner = (await import('./row-placed-derive.ts')).marklessRowPlacedDerive(runner, {
					graphNodeId: computed.graphNodeId,
					deriveSymbolId: runnerSymbolId,
				});
			return runner({
				// Inputs held at what the screen shows reach the runner, which reads through the graph.
				graph: read === graph.read ? graph : { ...graph, read },
				read,
				key,
				signal,
				element: input.root,
				getElementHandle: () => undefined,
			});
		},
	};
}

function asyncRunnerSymbolsByGraphNode(view: ProtocolViewPayload): Record<string, string> {
	const symbols = { ...view.asyncRunners };
	for (const boundary of view.asyncBoundaries)
		for (const read of boundary.asyncReads)
			if (read.runnerSymbolId) symbols[read.graphNodeId] ??= read.runnerSymbolId;
	return symbols;
}

async function deserializeAsyncComputedSnapshot(
	snapshot: NonNullable<ProtocolStatePayload['computed'][number]['snapshot']>,
	decode?: Decode,
) {
	if (snapshot.status === 'idle') return snapshot;
	decode ??= (await import('../../../serializer/src/value-decode-client-lazy.ts'))
		.deserializeGraphValueForClient as Decode;
	const decoded: Record<string, unknown> = {
		...snapshot,
		key: await decode(snapshot.key as SerializedGraphPayload),
	};
	if (snapshot.status === 'fulfilled')
		decoded.value = await decode(snapshot.value as SerializedGraphPayload);
	else if (snapshot.status === 'rejected')
		decoded.error = await decode(snapshot.error as SerializedGraphPayload);
	return decoded as RuntimeGraphAsyncSnapshot;
}

export type AsyncPlaneSlot = {
	async?: AsyncComputedPlaneFactory;
	held?: import('@markless/runtime').HeldInputsPlaneFactory;
	fromPayload?: (
		input: ResumePayloadGraphInput,
		graphRef: () => RuntimeGraph,
		decode: Decode,
	) => Promise<RuntimeGraphAsyncComputed[]>;
	fromRecord?: typeof asyncComputedFromRecord;
	awaits?: typeof awaitsAsyncValue;
	awaitsAncestor?: typeof awaitsAsyncAncestor;
	busy?: {
		readonly note: typeof note;
		readonly set: typeof set;
		readonly apply: typeof apply;
		readonly settleRange: typeof settleRange;
		readonly shown: typeof shown;
	};
	// Installed by `fns/resume-cache`: told when a boundary shows settled content.
	cache?: (
		wiring: Parameters<typeof import('../resume-async-wiring.ts').wireAsyncBoundariesWithoutLoadingCapability>[0],
		boundary: import('../resume-types.ts').ResumeAsyncBoundaryRecord,
		status: 'fulfilled' | 'rejected',
	) => void;
};

// Busy marks: the per-element marks load with the first refresh over shown content.
type Marks = typeof busyElements;
type AfterAnchor = { __marklessAfter?: ResumeDomComment };

let marks: Marks | undefined;
let queued: Array<(marks: Marks) => void> | undefined;
// The per-element marks load with the first refresh over shown content; until then nothing is marked, so other calls wait or drop.
function withMarks(start: boolean, run: (marks: Marks) => void): void {
	if (marks) return run(marks);
	if (!queued) {
		if (!start) return;
		queued = [];
		void import('./busy-elements.ts').then((module) => {
			marks = module.busyElements;
			for (const each of queued!) each(marks);
		});
	}
	queued.push(run);
}

export function note(
	boundary: BusyBoundary,
	graphNodeId: string,
	snapshot: unknown,
	showsSettledContent: boolean,
): void {
	withMarks(
		showsSettledContent && (snapshot as { readonly status?: unknown } | null)?.status === 'pending',
		(loaded) => loaded.note(boundary, graphNodeId, snapshot, showsSettledContent),
	);
}

export function set(boundary: BusyBoundary, busy: boolean): void {
	withMarks(busy, (loaded) => loaded.set(boundary, busy));
}

export function apply(boundary: BusyBoundary): void {
	withMarks(false, (loaded) => loaded.apply(boundary));
}

type ShownArm = { __marklessShownArm?: number };
export function shown(boundary: ResumeAsyncBoundaryRecord, arm: number): void {
	(boundary.endAnchor as ShownArm).__marklessShownArm = arm;
}

// A failed refresh over shown @try content keeps it and draws the @catch in a range opened after it.
export function settleRange(boundary: ResumeAsyncBoundaryRecord, arm: number): ResumeArmRange | undefined {
	const after =
		arm === ASYNC_BOUNDARY_ARM.catch &&
		((boundary.endAnchor as ShownArm).__marklessShownArm ?? boundary.initiallyServedArm) ===
			ASYNC_BOUNDARY_ARM.try;
	shown(boundary, after ? ASYNC_BOUNDARY_ARM.try : arm);
	if (!after) return;
	const end = boundary.endAnchor as unknown as ChildNode & AfterAnchor;
	let start = end.__marklessAfter as unknown as ChildNode | undefined;
	if (start?.parentNode !== end.parentNode) {
		// The arm-branch prefix keeps page-level comment walks from counting it.
		start = end.ownerDocument!.createComment('markless:arm-branch:after');
		end.before(start);
		end.__marklessAfter = start as unknown as ResumeDomComment;
	}
	return { id: `${boundary.id}:after`, startAnchor: end.__marklessAfter!, endAnchor: boundary.endAnchor };
}


// Entry marks, called by compiled handlers that write a key input of an async value.
type EntryMarkContext = {
	readonly graph?: {
		readonly asyncPlane?: () => Pick<AsyncComputedPlane, 'markEntry' | 'endEntry'> | undefined;
		readonly marklessQualifyGraphNodeId?: (graphNodeId: string) => string;
	};
	readonly userActionToken?: { readonly open: boolean };
};

// The end undoes what the start did, even when the token closed in between.
const opened = new WeakSet<object>();

/** Marks each async value busy from the handler's entry, ahead of the write that refreshes it; only inside a user action. */
export function marklessEntryMarkStart(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph;
	const plane = graph?.asyncPlane?.();
	if (!plane || context.userActionToken?.open !== true) return;
	opened.add(context);
	const qualify = graph!.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) plane.markEntry(qualify(graphNodeId));
}

/** Undoes `marklessEntryMarkStart` when the handler never reached the write; a no-op once the real refresh has started. */
export function marklessEntryMarkEnd(
	context: EntryMarkContext,
	graphNodeIds: ReadonlyArray<string>,
): void {
	const graph = context.graph;
	const plane = graph?.asyncPlane?.();
	if (!plane || !opened.delete(context)) return;
	const qualify = graph!.marklessQualifyGraphNodeId ?? ((graphNodeId: string) => graphNodeId);
	for (const graphNodeId of graphNodeIds) plane.endEntry(qualify(graphNodeId));
}
