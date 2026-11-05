import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import { asyncPlanes, derivedReconcilePlane } from './reconcile-plane-slot.ts';
import { hasLiveSharedDefinitions } from '../../serializer/src/protocol-shared-instances.ts';
import type { ResumeDomElement, ResumeRuntimeInput } from './resume.ts';

type RuntimeModule = typeof import('@markless/runtime');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;

export type ResumePayloadGraphInput = {
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
	readonly root: ResumeDomElement;
	readonly loadSymbol: ResumeRuntimeInput['loadSymbol'];
};

// Installed by a compiled module whose state declares a non-widget shared(); no module every app loads names it.
type SharedInstancesHost = {
	readonly __marklessSharedInstances?: () => Promise<typeof import('./fns/shared-instances.ts')>;
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
	const asyncComputed = input.state.computed.some((computed) => computed.async)
		? await asyncPlaneFactories().fromPayload(input, () => graph)
		: [];
	const cells = [
		...(await decodeStateCells(input.state, input.root.__marklessEventOnlyGraph)),
		...(await decodeServedComputedValues(input.state, input.root.__marklessEventOnlyGraph)),
	];
	const shared = hasLiveSharedDefinitions(input.state)
		? (await (globalThis as SharedInstancesHost).__marklessSharedInstances?.())?.bindSharedCells(
				input.root,
				input.state,
				cells,
			)
		: undefined;
	graph = createRuntimeGraph({
		cells: shared?.cells ?? cells,
		computed: input.state.computed.map((computed) => ({
			...computed,
			dependencies: computed.dependencies ?? [],
		})),
		sharedDefinitions: input.state.sharedDefinitions,
		asyncComputed,
		...(asyncComputed.length > 0 && asyncPlanes),
		reconcile: derivedReconcilePlane(),
	});
	shared?.connect(graph);
	return graph;
}

export async function decodeStateCells(
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

// A sync computed has no compute node here — `readGraph` answers it from the cells
// map — so a served value belongs there for a handler's first read to see it.
export async function decodeServedComputedValues(
	payload: ProtocolStatePayload,
	eventOnlyValues?: ReadonlyMap<string, unknown>,
) {
	const served = payload.computed.filter(
		(computed) => computed.value !== undefined || computed.directValue !== undefined,
	);
	if (served.length === 0) return [];
	return await Promise.all(
		served.map(async (computed) => ({
			graphNodeId: computed.graphNodeId,
			// A compiled closure re-derived it after the page was served.
			value: eventOnlyValues?.has(computed.graphNodeId)
				? eventOnlyValues.get(computed.graphNodeId)
				: computed.directValue !== undefined
					? computed.directValue
					: await deserializeGraphValue(computed.value as SerializedGraphPayload),
		})),
	);
}

export function asyncPlaneFactories() {
	if (!asyncPlanes.async) throw new Error('MARKLESS_ASYNC_PLANE_MISSING: no compiled module installed it');
	return asyncPlanes as Required<typeof asyncPlanes>;
}

export function runtimeModule(): Promise<RuntimeModule> {
	runtimeModulePromise ??= import('@markless/runtime');
	return runtimeModulePromise;
}

async function deserializeGraphValue(payload: SerializedGraphPayload): Promise<unknown> {
	valueDecoderPromise ??= import('../../serializer/src/value-decode-client-lazy.ts');
	const { deserializeGraphValueForClient } = await valueDecoderPromise;
	return deserializeGraphValueForClient(payload);
}
