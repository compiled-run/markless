// The start of a running container whose page- or container-scoped shared() instances hold no values yet.
import type { ProtocolStatePayload } from '@markless/serializer/protocol';
import type { RuntimeGraph } from '@markless/runtime';
import {
	PROTOCOL_SHARED_INSTANCES_PROPERTY,
	PROTOCOL_SHARED_INSTANCES_VERSION,
	type ProtocolSharedInstances,
} from '../../../serializer/src/protocol-shared-instances.ts';

type Definition = NonNullable<ProtocolStatePayload['sharedDefinitions']>[number];
type Host = {
	readonly __mL?: object;
	readonly __marklessEventOnlyGraph?: Map<string, unknown>;
	__mSharedReconcile?: true;
};
type Cell = { readonly graphNodeId: string; readonly value: unknown };

// Loaded only once a value moves: a container that never changes a shared value never runs it.
const instances = () => import('./shared-instances.ts');

export async function reconcileSharedCells(graph: RuntimeGraph): Promise<boolean> {
	return (await instances()).reconcileSharedCells(graph);
}

export async function registerDormantContainer(
	...input: Parameters<typeof import('./shared-instances.ts').registerDormantContainer>
): Promise<void> {
	(await instances()).registerDormantContainer(...input);
}

/**
 * Binds now when another container's write or a previous page left an instance holding values;
 * otherwise the binding loads on the first value that moves, here or in another container.
 */
export async function bindSharedCells(root: object, state: ProtocolStatePayload, cells: Cell[]) {
	const records = (state.sharedDefinitions ?? [])
		.filter((definition) => definition.scope !== 'widget')
		.map((definition): [Definition, ProtocolSharedInstances | undefined] => {
			const place = (
				definition.scope === 'container'
					? root
					: (globalThis.document ?? (root as Node).ownerDocument)
			) as Record<string, ProtocolSharedInstances>;
			const store = (place[PROTOCOL_SHARED_INSTANCES_PROPERTY] ??= {
				version: PROTOCOL_SHARED_INSTANCES_VERSION,
				instances: {},
			});
			return [
				definition,
				store.version === PROTOCOL_SHARED_INSTANCES_VERSION ? store : undefined,
			];
		});
	const host = root as Host;
	if (records.some(([definition, store]) => store?.instances[definition.id]?.shape)) {
		const bound = (await instances()).bindSharedCells(root, state, cells);
		return (
			bound && {
				cells: bound.cells,
				connect(graph: RuntimeGraph) {
					bound.connect(graph);
					host.__mSharedReconcile = true;
				},
			}
		);
	}
	return {
		cells,
		connect(graph: RuntimeGraph) {
			const life = host.__mL;
			const written = new Set<string>();
			let binding: Promise<void> | undefined;
			const bind = () =>
				(binding ??= instances().then(async (module) => {
					if (host.__mL === life)
						await module.bindRunningGraph(root, state, graph, written);
				}));
			for (const [definition, store] of records) {
				for (const graphNodeId of definition.graphNodeIds) {
					const wrote = () => (written.add(graphNodeId), void bind());
					// A first gesture's handler already wrote through the event-only graph.
					if (host.__marklessEventOnlyGraph?.has(graphNodeId)) wrote();
					graph.subscribe({
						id: `shared-bind:${graphNodeId}`,
						graphNodeId,
						path: [],
						run: wrote,
					});
				}
				if (!store) continue;
				// Running now, so another container's write reaches it through the listener, not a wake.
				store.dormant = store.dormant?.filter((other) => other !== root);
				(store.instances[definition.id] ??= {
					shape: '',
					cells: {},
					listeners: [],
				}).listeners.push({
					root,
					apply: () => (host.__mL === life ? void bind() : false),
				});
			}
		},
	};
}
