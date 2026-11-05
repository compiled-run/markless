import { createAsyncComputedPlane } from '@markless/runtime/graph-async';
import type {
	RuntimeGraph,
	RuntimeGraphAsyncComputed,
	RuntimeGraphAsyncSnapshot,
	RuntimeGraphRead,
} from '@markless/runtime';
import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../../serializer/src/value-decode-client.ts';
import type { ResumePayloadGraphInput } from '../payload-graph-construct.ts';
import { asyncPlanes } from '../reconcile-plane-slot.ts';
import { busyMarks } from './busy-marks.ts';

export function installMarklessAsyncPlane(): void {
	asyncPlanes.async = createAsyncComputedPlane;
	asyncPlanes.fromPayload = asyncComputedFromPayload;
	asyncPlanes.fromRecord = asyncComputedFromRecord;
	asyncPlanes.awaits = awaitsAsyncValue;
	asyncPlanes.busy = busyMarks;
	asyncPlanes.awaitsAncestor = awaitsAsyncAncestor;
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

// A re-run keeps its prior settled value readable (spec D8), so only a first run or a rejection has nothing to read.
function hasReadableValue(snapshot: unknown): boolean {
	const { status, value } =
		(snapshot as { readonly status?: unknown; readonly value?: unknown } | null) ?? {};
	return status === 'fulfilled' || (status === 'pending' && value !== undefined);
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

function asyncComputedFromPayload(
	input: ResumePayloadGraphInput,
	graphRef: () => RuntimeGraph,
): Promise<RuntimeGraphAsyncComputed[]> {
	const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);
	return Promise.all(
		input.state.computed
			.filter((computed) => computed.async === true && !!runnerSymbols[computed.graphNodeId])
			.map((computed) =>
				asyncComputedFromRecord(computed, runnerSymbols[computed.graphNodeId]!, input, graphRef),
			),
	);
}

async function asyncComputedFromRecord(
	computed: ProtocolStatePayload['computed'][number],
	runnerSymbolId: string,
	input: Pick<ResumePayloadGraphInput, 'root' | 'loadSymbol'>,
	graphRef: () => RuntimeGraph,
): Promise<RuntimeGraphAsyncComputed> {
	const dependencies = computed.dependencies ?? [];
	return {
		graphNodeId: computed.graphNodeId,
		dependencies,
		initialSnapshot:
			computed.snapshot && (await deserializeAsyncComputedSnapshot(computed.snapshot)),
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
			return (await input.loadSymbol(runnerSymbolId))({
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
) {
	if (snapshot.status === 'idle') return snapshot;
	const { deserializeGraphValueForClient: decode } = await import(
		'../../../serializer/src/value-decode-client-lazy.ts'
	);
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
	async?: typeof createAsyncComputedPlane;
	held?: import('@markless/runtime').HeldInputsPlaneFactory;
	fromPayload?: typeof asyncComputedFromPayload;
	fromRecord?: typeof asyncComputedFromRecord;
	awaits?: typeof awaitsAsyncValue;
	busy?: typeof busyMarks;
	awaitsAncestor?: typeof awaitsAsyncAncestor;
};
