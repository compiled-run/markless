import type {
	PayloadArenaArtifact,
	PayloadArenaInput,
	PayloadArmRecordSet,
	PayloadBehavior,
	PayloadKeyedRepeat,
	SemanticComponentPropBinding,
	SemanticGraphBinding,
} from '../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	runtimeGraphDependencyPath,
	runtimeGraphReadPath,
	semanticAliasMap,
	uniqueBy,
} from '../artifact-helpers/graph-paths.ts';
import { createRenderData } from './render-data/index.ts';
import { resolveSharedInstanceGraphPath } from './semantic-graph/collect-shared.ts';

export function planPayloadArena(input: PayloadArenaInput): PayloadArenaArtifact {
	const renderData =
		input.renderData ??
		createRenderData({
			semanticGraph: input.semanticGraph,
			symbolResolver: {
				passId: 'symbol-resolver',
				dynamicImportOwner: 'generated-symbol-resolver',
				symbols: [],
				syncPolicies: [],
				diagnostics: [],
			},
		});
	const bindings = new Map<string, SemanticGraphBinding>();
	const bindingsById = new Map<string, SemanticGraphBinding>();
	const aliases = semanticAliasMap(input.semanticGraph);
	const componentBindings = graphBindingMap(input.semanticGraph, null);
	const componentAliases = semanticAliasMap(input.semanticGraph, null);
	// The component a host element belongs to. Its chunk is the only record of
	// which component body a hostNodeId-keyed read was authored in.
	const componentByHostNodeId = new Map<string, string>(
		renderData.chunks.flatMap((chunk) =>
			chunk.hosts.map((host) => [host.hostNodeId, chunk.componentName] as const),
		),
	);

	for (const binding of input.semanticGraph.graphBindings) {
		bindings.set(binding.name, binding);
		bindingsById.set(binding.id, binding);
	}
	const usedStorageBindings = new Set(
		[
			...input.semanticGraph.templateReads.map(
				(read) => resolveGraphPath(read.source, bindings, aliases)?.binding,
			),
			...input.semanticGraph.stateReads
				.filter((read) => read.componentName !== undefined)
				.map((read) => resolveGraphPath(read.source, bindings, aliases)?.binding),
			...input.semanticGraph.stateWrites
				.filter((write) => write.componentName !== undefined)
				.map((write) => resolveGraphPath(write.target, bindings, aliases)?.binding),
		]
			.filter((binding): binding is SemanticGraphBinding => binding?.storage !== undefined)
			.map((binding) => binding.id),
	);

	const cells = input.semanticGraph.graphBindings
		.filter(
			(binding) =>
				binding.kind === 'state' &&
				(binding.storage === undefined || usedStorageBindings.has(binding.id)),
		)
		.map((binding) => ({
			graphNodeId: binding.id,
			name: binding.name,
			valueKind: binding.valueKind ?? 'unknown',
		}));
	const computed = input.semanticGraph.graphBindings
		.filter((binding) => binding.kind === 'computed')
		.map((binding) => ({
			graphNodeId: binding.id,
			name: binding.name,
			async: binding.async === true,
			functionSource: binding.functionSource,
			dependencies: binding.dependencies?.map((dependency) => {
				const target = bindingsById.get(dependency.graphNodeId);
				return target
					? { ...dependency, path: runtimeGraphDependencyPath(target, dependency.path) }
					: dependency;
			}),
		}));
	const sharedDefinitions = input.semanticGraph.sharedDefinitions.map((definition) => {
		const graphNodeIds = input.semanticGraph.graphBindings
			.filter((binding) => binding.sharedDefinitionId === definition.id)
			.map((binding) => binding.id);

		return {
			id: definition.id,
			name: definition.name,
			exportedName: definition.exportedName,
			...(definition.scope ? { scope: definition.scope } : {}),
			...(definition.dependencies ? { dependencies: definition.dependencies } : {}),
			...(definition.returnProperties
				? { returnProperties: definition.returnProperties }
				: {}),
			graphNodeIds,
		};
	});
	const locators = renderData.hosts.map((hostNode, index) => ({
		hostNodeId: hostNode.hostNodeId,
		strategy: 'dom-order' as const,
		index,
		tagName: hostNode.tagName,
	}));
	const behaviors = input.semanticGraph.behaviors.map((behavior) =>
		payloadBehavior(behavior, bindings, aliases),
	);
	const keyedRepeats = renderData.repeats.flatMap(
		(repeat): PayloadKeyedRepeat[] => {
			if (!repeat.collectionGraphNodeId) return [];

			const rowElementHandles = input.semanticGraph.elementHandleBindings.flatMap(
				(binding) => {
					if (binding.rowOwner?.repeatId !== repeat.repeatId) return [];
					const graphBinding = resolveElementHandleBinding(
						binding,
						input,
						bindings,
						aliases,
					);
					if (!graphBinding || graphBinding.kind !== 'element') return [];
					return [
						{
							hostNodeId: binding.hostNodeId,
							handleId: graphBinding.id,
							name: graphBinding.name,
							...(graphBinding.plural ? { plural: true as const } : {}),
						},
					];
				},
			);
			const rowBehaviors = behaviors.filter((behavior) =>
				behavior.keyedRepeatScopeIds?.includes(repeat.repeatId),
			);

			return [
				{
					id: repeat.repeatId,
					parentHostNodeId: repeat.parentHostNodeId,
					...(repeat.rowHostNodeId ? { rowHostNodeId: repeat.rowHostNodeId } : {}),
					collectionGraphNodeId: repeat.collectionGraphNodeId,
					collectionPath: repeat.collectionPath,
					keyPath: repeat.keyPath,
					...(rowElementHandles.length > 0 ? { rowElementHandles } : {}),
					...(rowBehaviors.length > 0 ? { rowBehaviors } : {}),
				},
			];
		},
	);
	const viewDomUpdates = input.semanticGraph.templateReads.flatMap((read) => {
		if (read.computedGraphNodeId) {
			return [
				{
					hostNodeId: read.hostNodeId,
					source: read.source,
					graphNodeId: read.computedGraphNodeId,
					path: [],
					target: read.target,
				},
			];
		}

		// Component scope only: a factory local and the instance local markup names
		// routinely collide. A template read carries no component of its own, so the
		// reading component is the one that renders the host it is bound to; without
		// it a read resolves to a sibling component's same-named local (defect 46).
		const resolved =
			resolveGraphPath(read.source, componentBindings, componentAliases) ??
			resolveSharedInstanceGraphPath(
				read.source,
				input.semanticGraph,
				componentByHostNodeId.get(read.hostNodeId),
			);
		if (!resolved) return [];

		return [
			{
				hostNodeId: read.hostNodeId,
				source: read.source,
				graphNodeId: resolved.binding.id,
				path: runtimeGraphReadPath(resolved.binding, resolved.path),
				target: read.target,
			},
		];
	});
	const elementHandles = input.semanticGraph.elementHandleBindings.flatMap((binding) => {
		if (binding.rowOwner || binding.keyedRepeatScopeIds.length > 0) return [];

		const graphBinding = resolveElementHandleBinding(binding, input, bindings, aliases);
		if (!graphBinding || graphBinding.kind !== 'element') return [];

		return [
			{
				hostNodeId: binding.hostNodeId,
				handleId: graphBinding.id,
				name: graphBinding.name,
				...(graphBinding.plural ? { plural: true as const } : {}),
			},
		];
	});
	// Unified comment-anchor stream: branch sites and async boundaries share
	// one document-order allocator (rank derives from collection anchorOrder).
	const anchorRank = new Map(
		[
			// Arm-scoped branch sites render as anchor-less ternaries (need 8);
			// they must not consume comment-anchor ranks.
			...renderData.branches.filter((site) => !site.asyncBoundaryId),
			...renderData.boundaries,
		]
			.sort((left, right) => left.anchorOrder - right.anchorOrder)
			.map((record, rank) => [
				'branchSiteId' in record ? record.branchSiteId : record.boundaryId,
				rank,
			] as const),
	);
	// D3: content inside a boundary arm lives in the boundary's own coordinate
	// space. Each arm's locators index from 0 = first element after the start
	// anchor in that arm's rendered content; resume adds the anchor's live
	// element-walk offset. Static indexes are the plain-content plan — the SSR
	// compose step replaces them with the rendered arm's truth.
	const boundaryArmRecords = (boundaryId: string): ReadonlyArray<PayloadArmRecordSet> =>
		[0, 1, 2].map((arm) => {
			const armHosts = renderData.hosts.filter(
				(host) =>
					host.asyncBoundaryId === boundaryId && (host.asyncBoundaryArm ?? 0) === arm,
			);
			const armHostIds = new Set(armHosts.map((hostNode) => hostNode.hostNodeId));
			return {
				locators: armHosts.map((hostNode, index) => ({
					hostNodeId: hostNode.hostNodeId,
					strategy: 'arm-relative' as const,
					index,
					tagName: hostNode.tagName,
				})),
				events: input.semanticGraph.events.filter((event) =>
					armHostIds.has(event.hostNodeId),
				),
				behaviors: behaviors.filter(
					(behavior) =>
						(behavior.keyedRepeatScopeIds?.length ?? 0) === 0 &&
						armHostIds.has(behavior.hostNodeId),
				),
				elementHandles: elementHandles.filter((handle) =>
					armHostIds.has(handle.hostNodeId),
				),
			};
		});
	const asyncBoundaries = renderData.boundaries.map((boundary) => {
		return {
			id: boundary.boundaryId,
			kind: 'async-boundary' as const,
			anchorOrder: boundary.anchorOrder,
			runnerGraphNodeId: boundary.runnerGraphNodeId,
			initiallyServedArm: boundary.initiallyServedArm,
			armRecords: boundaryArmRecords(boundary.boundaryId),
			startAnchor: {
				strategy: 'dom-order-comment' as const,
				index: (anchorRank.get(boundary.boundaryId) ?? 0) * 2,
			},
			endAnchor: {
				strategy: 'dom-order-comment' as const,
				index: (anchorRank.get(boundary.boundaryId) ?? 0) * 2 + 1,
			},
			asyncReads: boundary.reads,
		};
	});
	return {
		passId: 'payload-arena',
		state: {
			cells,
			storage: input.semanticGraph.graphBindings.flatMap((binding) =>
				binding.storage && usedStorageBindings.has(binding.id)
					? [{ graphNodeId: binding.id, key: binding.storage.key }]
					: [],
			),
			computed,
			sharedDefinitions,
		},
		view: {
			locators,
			keyedRepeats,
			events: input.semanticGraph.events,
			domUpdates: uniqueBy(
				viewDomUpdates,
				(domUpdate) =>
					`${domUpdate.hostNodeId}:${domUpdateTargetKey(domUpdate.target)}:${domUpdate.graphNodeId}:${domUpdate.path.join('.')}`,
			),
			behaviors: behaviors.filter(
				(behavior) => (behavior.keyedRepeatScopeIds?.length ?? 0) === 0,
			),
			elementHandles,
			asyncBoundaries,
			branchSites: renderData.branches.map((site) => ({
				id: site.branchSiteId,
				anchorOrder: site.anchorOrder,
			})),
		},
		diagnostics: input.stateLowering.diagnostics,
	};
}

function resolveElementHandleBinding(
	binding: PayloadArenaInput['semanticGraph']['elementHandleBindings'][number],
	input: PayloadArenaInput,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): SemanticGraphBinding | undefined {
	const shared = resolveSharedInstanceGraphPath(
		binding.handleName,
		input.semanticGraph,
		binding.componentName,
	);
	if (shared?.binding.kind === 'element' && shared.path.length === 0) return shared.binding;

	const direct = resolveGraphPath(binding.handleName, bindings, aliases);
	if (!direct) return undefined;
	if (direct.binding.kind === 'element' && direct.path.length === 0) return direct.binding;
	if (direct.binding.kind !== 'prop' || !binding.componentName) return undefined;

	const propName = direct.path[0];
	if (!propName || direct.path.length !== 1) return undefined;

	const prop = input.semanticGraph.componentEdges
		.filter((edge) => edge.childComponentName === binding.componentName)
		.flatMap((edge) => edge.props)
		.find(
			(
				candidate,
			): candidate is Extract<SemanticComponentPropBinding, { kind: 'graph-reference' }> =>
				candidate.name === propName &&
				candidate.kind === 'graph-reference' &&
				candidate.graphBindingKind === 'element' &&
				candidate.path.length === 0,
		);
	if (!prop) return undefined;

	return input.semanticGraph.graphBindings.find(
		(graphBinding) => graphBinding.id === prop.graphNodeId,
	);
}

function domUpdateTargetKey(
	target: PayloadArenaArtifact['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
	if (target.kind === 'text') {
		return `text:${target.prefix ?? ''}:${target.suffix ?? ''}:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	}
	if (target.kind === 'class')
		return `class:${target.trueValue ?? ''}:${target.falseValue ?? ''}`;
	return target.kind;
}

function payloadBehavior(
	behavior: PayloadArenaInput['semanticGraph']['behaviors'][number],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadBehavior {
	const inputValues = behaviorInputValues(behavior.inputSources, bindings, aliases);
	const inputGraphReads = behaviorInputGraphReads(behavior.inputSources, bindings, aliases);
	if (!inputValues && !inputGraphReads) return behavior;

	return {
		...behavior,
		...(inputValues ? { inputValues } : {}),
		...(inputGraphReads ? { inputGraphReads } : {}),
	};
}

function behaviorInputGraphReads(
	inputSources: ReadonlyArray<string>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadBehavior['inputGraphReads'] | undefined {
	const graphReads = inputSources.flatMap((inputSource, inputIndex) => {
		const resolved = resolveGraphPath(inputSource, bindings, aliases);
		if (!resolved) return [];
		// Prop reads stay in the record so composition can remap them to the
		// parent graph node — dropping them left composed child behaviors
		// activating with undefined inputs.
		if (
			resolved.binding.kind !== 'state' &&
			resolved.binding.kind !== 'computed' &&
			resolved.binding.kind !== 'prop'
		) {
			return [];
		}

		return [
			{
				inputIndex,
				source: inputSource,
				graphNodeId: resolved.binding.id,
				path: runtimeGraphReadPath(resolved.binding, resolved.path),
			},
		];
	});

	return graphReads.length > 0 ? graphReads : undefined;
}

function behaviorInputValues(
	inputSources: ReadonlyArray<string>,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): ReadonlyArray<unknown> | undefined {
	if (inputSources.length === 0) return undefined;

	const values: unknown[] = [];
	for (const inputSource of inputSources) {
		const inputValue =
			literalBehaviorInputValue(inputSource) ??
			graphInitialBehaviorInputValue(inputSource, bindings, aliases);
		if (!inputValue) return undefined;

		values.push(inputValue.value);
	}

	return values;
}

type BehaviorInputValue = {
	readonly value: unknown;
};

function graphInitialBehaviorInputValue(
	source: string,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): BehaviorInputValue | undefined {
	const resolved = resolveGraphPath(source, bindings, aliases);
	if (!resolved || resolved.binding.kind !== 'state') return undefined;

	return pathInitialValue(resolved.binding.initialValue, resolved.path);
}

function pathInitialValue(
	initialValue: unknown,
	path: ReadonlyArray<string>,
): BehaviorInputValue | undefined {
	if (initialValue === undefined) return undefined;

	let value: unknown = initialValue;
	for (const segment of path) {
		if (value === null || value === undefined) return undefined;

		if (Array.isArray(value)) {
			const index = Number(segment);
			if (!Number.isInteger(index) || index < 0 || index >= value.length) {
				return undefined;
			}
			value = value[index];
			continue;
		}

		if (typeof value !== 'object') return undefined;
		const objectValue = value as Record<string, unknown>;
		if (!(segment in objectValue)) return undefined;

		value = objectValue[segment];
	}

	if (value === undefined) return undefined;
	return { value };
}

function literalBehaviorInputValue(source: string): BehaviorInputValue | undefined {
	const valueSource = source.trim();
	if (valueSource === 'true') return { value: true };
	if (valueSource === 'false') return { value: false };
	if (valueSource === 'null') return { value: null };
	if (/^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(valueSource)) {
		const value = Number(valueSource);
		if (Number.isFinite(value)) return { value };
	}

	const stringValue = literalStringValue(valueSource);
	if (stringValue) return stringValue;

	return undefined;
}

function literalStringValue(source: string): BehaviorInputValue | undefined {
	if (/^"(?:\\.|[^"\\])*"$/.test(source)) {
		try {
			return { value: JSON.parse(source) as unknown };
		} catch {
			return undefined;
		}
	}

	if (/^'(?:\\.|[^'\\])*'$/.test(source)) {
		return {
			value: source.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
		};
	}

	return undefined;
}
