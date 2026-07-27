import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import type { ResumeDomElement, ResumeRuntimeInput } from './resume.ts';

type RuntimeModule = typeof import('@markless/runtime');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;
type RuntimeGraphAsyncSnapshot = import('@markless/runtime').RuntimeGraphAsyncSnapshot;
type RuntimeGraphRead = import('@markless/runtime').RuntimeGraphRead;

export type ResumePayloadGraphInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
};

let runtimeModulePromise: Promise<RuntimeModule> | undefined;
let valueDecoderPromise:
	| Promise<typeof import('../../serializer/src/value-decode-client.ts')>
	| undefined;

export async function createRuntimeGraphFromStatePayload(
	payload: ProtocolStatePayload,
): Promise<RuntimeGraph> {
	const { createRuntimeGraph } = await runtimeModule();
	return createRuntimeGraph({
		cells: await decodeStateCells(payload),
		sharedDefinitions: payload.sharedDefinitions,
	});
}

export async function createRuntimeGraphFromResumePayload(
	input: ResumePayloadGraphInput,
): Promise<RuntimeGraph> {
	const { createRuntimeGraph } = await runtimeModule();
	let graph!: RuntimeGraph;
	const asyncComputed = await asyncComputedFromPayload(input, () => graph);
	graph = createRuntimeGraph({
		cells: await decodeStateCells(input.state, input.root.__marklessEventOnlyGraph),
		computed: input.state.computed.map((computed) => ({
			...computed,
			dependencies: computed.dependencies ?? [],
		})),
		sharedDefinitions: input.state.sharedDefinitions,
		asyncComputed,
	});
	return graph;
}

async function decodeStateCells(
	payload: ProtocolStatePayload,
	eventOnlyValues?: ReadonlyMap<string, unknown>,
) {
	const cells = await Promise.all(
		payload.cells.map(async (cell) => {
			// CSR-mounted pages seed prop cells with live values that never
			// crossed the HTML boundary — there is no serialized envelope to
			// decode, the value is used as-is (dashboard-migration need 14).
			const directValue = (cell as { readonly directValue?: unknown }).directValue;
			return {
				graphNodeId: cell.graphNodeId,
				value: eventOnlyValues?.has(cell.graphNodeId)
					? eventOnlyValues.get(cell.graphNodeId)
					: directValue !== undefined
						? directValue
						: cell.value === undefined
							? undefined
							: await deserializeGraphValue(cell.value as SerializedGraphPayload),
			};
		}),
	);
	const storage = payload.storage ?? [];
	if (storage.length === 0) return cells;
	// Storage-free pages must carry none of the storage surface: the slot-override
	// pass lives in the demand-loaded storage plane, behind the same emptiness
	// signal the resume runtime's `hasStorageCells` gate reads.
	return (await import('./storage-plane.ts')).applyStorageReadInitializers(cells, storage);
}

function asyncComputedFromPayload(
	input: ResumePayloadGraphInput,
	graphRef: () => RuntimeGraph,
): Promise<NonNullable<Parameters<RuntimeModule['createRuntimeGraph']>[0]['asyncComputed']>> {
	const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);
	return Promise.all(
		input.state.computed
			.filter((computed) => computed.async === true && !!runnerSymbols[computed.graphNodeId])
			.map(async (computed) => {
				const runnerSymbolId = runnerSymbols[computed.graphNodeId]!;
				const dependencies = computed.dependencies ?? [];
				return {
					graphNodeId: computed.graphNodeId,
					dependencies,
					initialSnapshot:
						computed.snapshot &&
						(await deserializeAsyncComputedSnapshot(computed.snapshot)),
					key: (read: RuntimeGraphRead) => {
						const dependency = dependencies[0];
						return dependencies.length > 1
							? dependencies.map((dependency) =>
									read(dependency.graphNodeId, dependency.path),
								)
							: dependency && read(dependency.graphNodeId, dependency.path);
					},
					run: async ({ key, signal, read }) => {
						return (await input.loadSymbol(runnerSymbolId))({
							graph: graphRef(),
							read,
							key,
							signal,
							element: input.root,
							getElementHandle: () => undefined,
						});
					},
				};
			}),
	);
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
	const decoded: Record<string, unknown> = {
		...snapshot,
		key: await deserializeGraphValue(snapshot.key as SerializedGraphPayload),
	};
	if (snapshot.status === 'fulfilled')
		decoded.value = await deserializeGraphValue(snapshot.value as SerializedGraphPayload);
	else if (snapshot.status === 'rejected')
		decoded.error = await deserializeGraphValue(snapshot.error as SerializedGraphPayload);
	return decoded as RuntimeGraphAsyncSnapshot;
}

function runtimeModule(): Promise<RuntimeModule> {
	runtimeModulePromise ??= import('@markless/runtime');
	return runtimeModulePromise;
}

async function deserializeGraphValue(payload: SerializedGraphPayload): Promise<unknown> {
	valueDecoderPromise ??= import('../../serializer/src/value-decode-client.ts');
	const { deserializeGraphValueForClient } = await valueDecoderPromise;
	return deserializeGraphValueForClient(payload);
}
