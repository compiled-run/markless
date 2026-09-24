import type {
	ProtocolStatePayload,
	ProtocolViewPayload,
} from '../../../packages/serializer/src/protocol.ts';
import { deserializeGraphValue } from '../../../packages/serializer/src/value-decode.ts';
import { protocolInstancePath } from '../../../packages/serializer/src/protocol-constants.ts';

export type MdxResumeGroup = {
	readonly id: string;
	readonly graphNodeIds: ReadonlyArray<string>;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
};

export type MdxResumeRefusal = {
	readonly prefix: string;
	readonly reason:
		| 'invalid-prefix'
		| 'overlapping-prefixes'
		| 'state-inventory'
		| 'unsupported-activation'
		| 'opaque-cell-captures'
		| 'callback-provenance'
		| 'definition-dependency'
		| 'host-inventory'
		| 'handle-dependency'
		| 'symbol-dependency'
		| 'seed-alias-dependency'
		| 'graph-dependency'
		| 'incoming-dependency';
	readonly ids: ReadonlyArray<string>;
};

type RenderedCallbackBinding = {
	readonly graphNodeId: string;
	readonly value: string | undefined;
	readonly symbolId?: string;
};

export function planMdxResumeGroups(input: {
	readonly callbackBindings?: ReadonlyArray<RenderedCallbackBinding>;
	readonly children: ReadonlyArray<{
		readonly prefix: string;
		readonly state: ProtocolStatePayload;
	}>;
	readonly state: ProtocolStatePayload;
	readonly view: ProtocolViewPayload;
}): {
	readonly groups: ReadonlyArray<MdxResumeGroup>;
	readonly refusals: ReadonlyArray<MdxResumeRefusal>;
	readonly remainder: {
		readonly state: ProtocolStatePayload;
		readonly view: ProtocolViewPayload;
	};
} {
	const callbacks = input.callbackBindings ?? [];
	const invalidCallbacks = invalidCallbackBindings(input.state.cells, callbacks);
	const witnessed = new Set(callbacks.map((callback) => callback.graphNodeId));
	const groups: MdxResumeGroup[] = [];
	const refusals: MdxResumeRefusal[] = [];
	for (const child of input.children) {
		const { prefix, state } = child;
		const refuse = (reason: MdxResumeRefusal['reason'], ids: string[] = []) =>
			refusals.push({ prefix, reason, ids: [...new Set(ids)] });
		if (!prefix || protocolInstancePath(prefix) !== prefix) {
			refuse('invalid-prefix');
			continue;
		}
		if (
			input.children.some(
				(other) =>
					other !== child &&
					(other.prefix.startsWith(prefix) || prefix.startsWith(other.prefix)),
			)
		) {
			refuse('overlapping-prefixes');
			continue;
		}
		const owns = (id: string) => id.startsWith(prefix);
		if (invalidCallbacks.length > 0) {
			refuse('callback-provenance', invalidCallbacks);
			continue;
		}
		if (
			(['cells', 'computed', 'sharedSeeds'] as const).some(
				(key) =>
					!sameInventory(
						state[key] ?? [],
						(input.state[key] ?? []).filter((record) => owns(record.graphNodeId)),
						'graphNodeId',
						key !== 'sharedSeeds',
					),
			) ||
			!sameInventory(
				state.sharedDefinitions ?? [],
				(input.state.sharedDefinitions ?? []).filter((record) => owns(record.id)),
				'id',
			)
		) {
			refuse('state-inventory');
			continue;
		}
		const view = filterView(input.view, owns);
		if (
			view.events.length === 0 ||
			view.events.some((event) => event.eventName === 'visible' || event.action) ||
			view.behaviors.length > 0 ||
			view.asyncBoundaries.length > 0 ||
			(view.branches?.length ?? 0) > 0 ||
			(view.keyedRepeats?.length ?? 0) > 0 ||
			Object.keys(view.asyncRunners ?? {}).length > 0 ||
			(state.storage?.length ?? 0) > 0 ||
			state.computed.some((record) => record.async === true)
		) {
			refuse('unsupported-activation');
			continue;
		}
		const opaque = input.state.cells.filter(
			(cell) => cell.valueKind === 'unknown' && !witnessed.has(cell.graphNodeId),
		);
		if (opaque.length > 0) {
			refuse(
				'opaque-cell-captures',
				opaque.map((cell) => cell.graphNodeId),
			);
			continue;
		}
		const definitions = new Set((state.sharedDefinitions ?? []).map((record) => record.id));
		const foreignDefinitions = (state.sharedDefinitions ?? []).flatMap((record) => [
			...(!owns(record.id) || record.scope !== 'widget' ? [record.id] : []),
			...(record.dependencies ?? [])
				.filter((dependency) => !definitions.has(dependency.definitionId))
				.map((dependency) => dependency.definitionId),
		]);
		if (foreignDefinitions.length > 0) {
			refuse('definition-dependency', foreignDefinitions);
			continue;
		}
		const hosts = new Set(view.locators.map((record) => record.hostNodeId));
		const missingHosts = [...view.events, ...view.domUpdates, ...view.elementHandles]
			.filter((record) => !hosts.has(record.hostNodeId))
			.map((record) => record.hostNodeId);
		if (hosts.size !== view.locators.length || missingHosts.length > 0) {
			refuse('host-inventory', missingHosts);
			continue;
		}
		const foreignHandles = view.elementHandles.filter((record) => !owns(record.handleId));
		if (foreignHandles.length > 0) {
			refuse(
				'handle-dependency',
				foreignHandles.map((record) => record.handleId),
			);
			continue;
		}
		const foreignSymbols = [
			...symbolReferences([
				state,
				view,
				callbacks.filter((callback) => owns(callback.graphNodeId)),
			]),
		].filter((id) => !owns(id));
		if (foreignSymbols.length > 0) {
			refuse('symbol-dependency', foreignSymbols);
			continue;
		}
		const aliases = (state.sharedSeeds ?? []).flatMap((seed) =>
			seed.dependencies.map((dependency) => dependency.reads.graphNodeId),
		);
		if (aliases.some((id) => !owns(id))) {
			refuse(
				'seed-alias-dependency',
				aliases.filter((id) => !owns(id)),
			);
			continue;
		}
		const graphNodeIds = [
			...new Set([
				...state.cells.map((record) => record.graphNodeId),
				...state.computed.map((record) => record.graphNodeId),
				...(state.sharedSeeds ?? []).map((record) => record.graphNodeId),
				...view.elementHandles.map((record) => record.handleId),
				...(state.sharedDefinitions ?? []).flatMap((record) => [
					...record.graphNodeIds,
					...(record.projectionIds ?? []),
					...(record.returnProperties ?? []).flatMap((property) =>
						'graphNodeId' in property ? [property.graphNodeId] : [],
					),
				]),
			]),
		];
		const nodes = new Set(graphNodeIds);
		const references = graphReferences([withoutSeedAliases(state), view]);
		const missingNodes = [...references].filter((id) => !nodes.has(id));
		if (nodes.size === 0 || graphNodeIds.some((id) => !owns(id)) || missingNodes.length > 0) {
			refuse('graph-dependency', [
				...graphNodeIds.filter((id) => !owns(id)),
				...missingNodes,
			]);
			continue;
		}
		const outside = [
			callbacks.filter((callback) => !owns(callback.graphNodeId)),
			filterView(input.view, (id) => !owns(id)),
			input.state.computed.filter((record) => !nodes.has(record.graphNodeId)),
			input.state.storage ?? [],
			(input.state.sharedSeeds ?? []).filter((record) => !nodes.has(record.graphNodeId)),
			(input.state.sharedDefinitions ?? []).filter((record) => !owns(record.id)),
		];
		const incoming = [
			...[...graphReferences(outside)].filter((id) => nodes.has(id)),
			...[...symbolReferences(outside)].filter(owns),
			...[...namedReferences(outside, new Set(['handleId', 'definitionId']))].filter(owns),
		];
		if (incoming.length > 0) {
			refuse('incoming-dependency', incoming);
			continue;
		}
		groups.push({ id: prefix, graphNodeIds, state, view });
	}
	if (groups.length === 0)
		return { groups, refusals, remainder: { state: input.state, view: input.view } };
	const nodes = new Set(groups.flatMap((group) => group.graphNodeIds));
	const deferred = (id: string) => groups.some((group) => id.startsWith(group.id));
	return {
		groups,
		refusals,
		remainder: {
			state: {
				...input.state,
				cells: input.state.cells.filter((record) => !nodes.has(record.graphNodeId)),
				computed: input.state.computed.filter((record) => !nodes.has(record.graphNodeId)),
				...(input.state.sharedSeeds
					? {
							sharedSeeds: input.state.sharedSeeds.filter(
								(record) => !nodes.has(record.graphNodeId),
							),
						}
					: {}),
				...(input.state.sharedDefinitions
					? {
							sharedDefinitions: input.state.sharedDefinitions.filter(
								(record) => !deferred(record.id),
							),
						}
					: {}),
			},
			view: filterView(input.view, (id) => !deferred(id)),
		},
	};
}

function filterView(
	view: ProtocolViewPayload,
	matches: (id: string) => boolean,
): ProtocolViewPayload {
	return {
		...view,
		locators: view.locators.filter((record) => matches(record.hostNodeId)),
		events: view.events.filter((record) => matches(record.hostNodeId)),
		domUpdates: view.domUpdates.filter((record) => matches(record.hostNodeId)),
		behaviors: view.behaviors.filter((record) => matches(record.hostNodeId)),
		elementHandles: view.elementHandles.filter((record) => matches(record.hostNodeId)),
		asyncBoundaries: view.asyncBoundaries.filter((record) => matches(record.id)),
		...(view.branches
			? { branches: view.branches.filter((record) => matches(record.id)) }
			: {}),
		...(view.keyedRepeats
			? { keyedRepeats: view.keyedRepeats.filter((record) => matches(record.id)) }
			: {}),
		...(view.asyncRunners
			? {
					asyncRunners: Object.fromEntries(
						Object.entries(view.asyncRunners).filter(([id]) => matches(id)),
					),
				}
			: {}),
	};
}

function graphReferences(value: unknown, ids = new Set<string>()): Set<string> {
	if (!value || typeof value !== 'object') return ids;
	if (Array.isArray(value)) {
		for (const record of value) graphReferences(record, ids);
		return ids;
	}
	for (const [key, record] of Object.entries(value)) {
		if (key === 'value' || key === 'directValue') continue;
		if (
			key === 'graphNodeId' ||
			key === 'runnerGraphNodeId' ||
			key === 'collectionGraphNodeId'
		) {
			if (typeof record === 'string') ids.add(record);
		} else if (key === 'graphNodeIds' || key === 'projectionIds') {
			if (Array.isArray(record))
				for (const id of record) if (typeof id === 'string') ids.add(id);
		} else graphReferences(record, ids);
	}
	return ids;
}

function sameInventory(
	declared: readonly { readonly graphNodeId?: string; readonly id?: string }[],
	composed: readonly { readonly graphNodeId?: string; readonly id?: string }[],
	key: 'graphNodeId' | 'id',
	unique = true,
): boolean {
	if (declared.length !== composed.length) return false;
	if (
		unique &&
		(new Set(declared.map((record) => record[key])).size !== declared.length ||
			new Set(composed.map((record) => record[key])).size !== composed.length)
	)
		return false;
	const before = declared.map((record) => JSON.stringify(record)).sort();
	const after = composed.map((record) => JSON.stringify(record)).sort();
	return before.every((record, index) => record === after[index]);
}

function withoutSeedAliases(state: ProtocolStatePayload) {
	return {
		...state,
		sharedSeeds: state.sharedSeeds?.map((seed) => ({
			...seed,
			dependencies: seed.dependencies.map(({ graphNodeId, path }) => ({ graphNodeId, path })),
		})),
	};
}

function symbolReferences(value: unknown): Set<string> {
	return namedReferences(
		value,
		new Set(['symbolId', 'symbolIds', 'deriveSymbolId', 'runnerSymbolId', 'updateSymbolId']),
	);
}

function namedReferences(
	value: unknown,
	keys: ReadonlySet<string>,
	ids = new Set<string>(),
): Set<string> {
	if (!value || typeof value !== 'object') return ids;
	if (Array.isArray(value)) {
		for (const record of value) namedReferences(record, keys, ids);
		return ids;
	}
	for (const [key, record] of Object.entries(value)) {
		if (key === 'value' || key === 'directValue') continue;
		if (keys.has(key)) {
			if (typeof record === 'string') ids.add(record);
			else if (Array.isArray(record))
				for (const id of record) if (typeof id === 'string') ids.add(id);
		} else namedReferences(record, keys, ids);
	}
	return ids;
}

function invalidCallbackBindings(
	cells: ProtocolStatePayload['cells'],
	bindings: ReadonlyArray<RenderedCallbackBinding>,
): string[] {
	const seen = new Set<string>();
	return bindings.flatMap((binding) => {
		const cell = cells.find((cell) => cell.graphNodeId === binding.graphNodeId);
		const duplicate = seen.has(binding.graphNodeId);
		seen.add(binding.graphNodeId);
		if (
			!cell ||
			duplicate ||
			(binding.value === undefined) !== (binding.symbolId === undefined)
		)
			return [binding.graphNodeId];
		try {
			const value =
				cell.directValue !== undefined
					? cell.directValue
					: cell.value === undefined
						? undefined
						: deserializeGraphValue(cell.value as never);
			return value === binding.value ? [] : [binding.graphNodeId];
		} catch {
			return [binding.graphNodeId];
		}
	});
}
