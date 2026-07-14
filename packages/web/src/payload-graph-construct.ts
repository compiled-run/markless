import type { ProtocolStatePayload, ProtocolViewPayload } from '@markless/serializer/protocol';
import type { SerializedGraphPayload } from '../../serializer/src/value-decode-client.ts';
import type { ResumeDomElement, ResumeRuntimeInput } from './resume.ts';

type RuntimeModule = typeof import('@markless/runtime');
type RuntimeGraph = import('@markless/runtime').RuntimeGraph;
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
		sharedDefinitions: input.state.sharedDefinitions,
		asyncComputed,
	});
	return graph;
}

async function decodeStateCells(
	payload: ProtocolStatePayload,
	eventOnlyValues?: ReadonlyMap<string, unknown>,
) {
	return Promise.all(
		payload.cells.map(async (cell) => {
			if (eventOnlyValues?.has(cell.graphNodeId)) {
				return {
					graphNodeId: cell.graphNodeId,
					value: eventOnlyValues.get(cell.graphNodeId),
				};
			}
			// CSR-mounted pages seed prop cells with live values that never
			// crossed the HTML boundary — there is no serialized envelope to
			// decode, the value is used as-is (dashboard-migration need 14).
			const directValue = (cell as { readonly directValue?: unknown }).directValue;
			if (directValue !== undefined) {
				return { graphNodeId: cell.graphNodeId, value: directValue };
			}
			return {
				graphNodeId: cell.graphNodeId,
				value:
					cell.value === undefined
						? undefined
						: await deserializeGraphValue(cell.value as SerializedGraphPayload),
			};
		}),
	);
}

function asyncComputedFromPayload(
	input: ResumePayloadGraphInput,
	graphRef: () => RuntimeGraph,
): Promise<NonNullable<Parameters<RuntimeModule['createRuntimeGraph']>[0]['asyncComputed']>> {
	const runnerSymbols = asyncRunnerSymbolsByGraphNode(input.view);
	return Promise.all(
		input.state.computed.flatMap(async (computed) => {
			if (computed.async !== true) return [];
			const runnerSymbolId = runnerSymbols.get(computed.graphNodeId);
			if (!runnerSymbolId) return [];
			const dependencies = computed.dependencies ?? [];
			return [
				{
					graphNodeId: computed.graphNodeId,
					dependencies,
					initialSnapshot: computed.snapshot
						? await deserializeAsyncComputedSnapshot(computed.snapshot)
						: undefined,
					key: (read: RuntimeGraphRead) => dependencyKey(dependencies, read),
					run: async ({ key, signal, read }) => {
						const symbol = await input.loadSymbol(runnerSymbolId);
						return await symbol({
							graph: graphRef(),
							read,
							key,
							signal,
							element: input.root,
							getElementHandle: () => undefined,
						});
					},
				},
			];
		}),
	).then((entries) => entries.flat());
}

async function deserializeAsyncComputedSnapshot(
	snapshot: NonNullable<ProtocolStatePayload['computed'][number]['snapshot']>,
) {
	if (snapshot.status === 'idle') return snapshot;
	const key = await deserializeGraphValue(snapshot.key as SerializedGraphPayload);
	if (snapshot.status === 'pending') {
		return { status: snapshot.status, version: snapshot.version, key };
	}
	if (snapshot.status === 'fulfilled') {
		return {
			status: snapshot.status,
			version: snapshot.version,
			key,
			value: await deserializeGraphValue(snapshot.value as SerializedGraphPayload),
		};
	}
	return {
		status: snapshot.status,
		version: snapshot.version,
		key,
		error: await deserializeGraphValue(snapshot.error as SerializedGraphPayload),
	};
}

function asyncRunnerSymbolsByGraphNode(view: ProtocolViewPayload): Map<string, string> {
	const symbols = new Map<string, string>();
	for (const boundary of view.asyncBoundaries) {
		for (const read of boundary.asyncReads) {
			if (read.runnerSymbolId && !symbols.has(read.graphNodeId)) {
				symbols.set(read.graphNodeId, read.runnerSymbolId);
			}
		}
	}
	return symbols;
}

function dependencyKey(
	dependencies: NonNullable<ProtocolStatePayload['computed'][number]['dependencies']>,
	read: RuntimeGraphRead,
): unknown {
	if (dependencies.length === 0) return undefined;
	if (dependencies.length === 1) {
		const dependency = dependencies[0]!;
		return read(dependency.graphNodeId, dependency.path);
	}
	return dependencies.map((dependency) => read(dependency.graphNodeId, dependency.path));
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
