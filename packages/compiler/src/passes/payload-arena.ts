import type {
	PayloadArenaArtifact,
	PayloadArenaInput,
	PayloadArmRecordSet,
	PayloadBehavior,
	PayloadKeyedRepeat,
	SemanticGraphBinding,
} from '../artifacts.ts';
import { resolveGraphPath, semanticAliasMap, uniqueBy } from '../artifact-helpers/graph-paths.ts';

export function planPayloadArena(input: PayloadArenaInput): PayloadArenaArtifact {
	const bindings = new Map<string, SemanticGraphBinding>();
	const aliases = semanticAliasMap(input.semanticGraph);

	for (const binding of input.semanticGraph.graphBindings) {
		bindings.set(binding.name, binding);
	}

	const cells = input.semanticGraph.graphBindings
		.filter((binding) => binding.kind === 'state')
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
			dependencies: binding.dependencies,
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
	const locators = input.semanticGraph.hostNodes.map((hostNode, index) => ({
		hostNodeId: hostNode.id,
		strategy: 'dom-order' as const,
		index,
		tagName: hostNode.tagName,
	}));
	const keyedRepeats = input.semanticGraph.keyedRepeats.flatMap(
		(repeat): PayloadKeyedRepeat[] => {
			if (!repeat.collectionGraphNodeId) return [];

			return [
				{
					id: repeat.id,
					parentHostNodeId: repeat.parentHostNodeId,
					...(repeat.rowHostNodeId ? { rowHostNodeId: repeat.rowHostNodeId } : {}),
					collectionGraphNodeId: repeat.collectionGraphNodeId,
					collectionPath: repeat.collectionPath,
					keyPath: repeat.keyPath,
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

		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved) return [];

		return [
			{
				hostNodeId: read.hostNodeId,
				source: read.source,
				graphNodeId: resolved.binding.id,
				path: resolved.path,
				target: read.target,
			},
		];
	});
	const elementHandles = input.semanticGraph.elementHandleBindings.flatMap((binding) => {
		if (binding.keyedRepeatScopeIds.length > 0) return [];

		const graphBinding = resolveElementHandleBinding(binding, input, bindings, aliases);
		if (!graphBinding || graphBinding.kind !== 'element') return [];

		return [
			{
				hostNodeId: binding.hostNodeId,
				handleId: graphBinding.id,
				name: graphBinding.name,
			},
		];
	});
	// Unified comment-anchor stream: branch sites and async boundaries share
	// one document-order allocator (rank derives from collection anchorOrder).
	const anchorRank = new Map(
		[
			// Arm-scoped branch sites render as anchor-less ternaries (need 8);
			// they must not consume comment-anchor ranks.
			...input.semanticGraph.branchSites.filter((site) => !site.asyncBoundaryId),
			...input.semanticGraph.asyncBoundaries,
		]
			.sort((left, right) => left.anchorOrder - right.anchorOrder)
			.map((record, rank) => [record.id, rank] as const),
	);
	const behaviors = input.semanticGraph.behaviors.map((behavior) =>
		payloadBehavior(behavior, bindings, aliases),
	);
	// D3: content inside a boundary arm lives in the boundary's own coordinate
	// space. Each arm's locators index from 0 = first element after the start
	// anchor in that arm's rendered content; resume adds the anchor's live
	// element-walk offset. Static indexes are the plain-content plan — the SSR
	// compose step replaces them with the rendered arm's truth.
	const boundaryArmRecords = (boundaryId: string): ReadonlyArray<PayloadArmRecordSet> =>
		[0, 1, 2].map((arm) => {
			const armHosts = input.semanticGraph.hostNodes.filter(
				(hostNode) =>
					hostNode.asyncBoundaryId === boundaryId &&
					(hostNode.asyncBoundaryArm ?? 0) === arm,
			);
			const armHostIds = new Set(armHosts.map((hostNode) => hostNode.id));
			return {
				locators: armHosts.map((hostNode, index) => ({
					hostNodeId: hostNode.id,
					strategy: 'arm-relative' as const,
					index,
					tagName: hostNode.tagName,
				})),
				events: input.semanticGraph.events.filter((event) => armHostIds.has(event.hostNodeId)),
				behaviors: behaviors.filter((behavior) => armHostIds.has(behavior.hostNodeId)),
				elementHandles: elementHandles.filter((handle) => armHostIds.has(handle.hostNodeId)),
			};
		});
	const asyncBoundaries = input.semanticGraph.asyncBoundaries.map((boundary) => ({
		id: boundary.id,
		kind: 'async-boundary' as const,
		anchorOrder: boundary.anchorOrder,
		armRecords: boundaryArmRecords(boundary.id),
		startAnchor: {
			strategy: 'dom-order-comment' as const,
			index: (anchorRank.get(boundary.id) ?? 0) * 2,
		},
		endAnchor: {
			strategy: 'dom-order-comment' as const,
			index: (anchorRank.get(boundary.id) ?? 0) * 2 + 1,
		},
		asyncReads: uniqueBy(
			[
				...input.semanticGraph.templateReads,
				// Keyed repeats inside the arm read their collection from the
				// boundary's async computed — the boundary owns that read too.
				...input.semanticGraph.keyedRepeats.map((repeat) => ({
					source: repeat.collectionSource,
					asyncBoundaryId: repeat.asyncBoundaryId,
				})),
				// Components inside the arm read the async computed through their
				// graph-reference props (need 10).
				...input.semanticGraph.componentEdges.flatMap((edge) =>
					edge.props.flatMap((prop) =>
						prop.kind === 'graph-reference'
							? [{ source: prop.source, asyncBoundaryId: edge.asyncBoundaryId }]
							: [],
					),
				),
			].flatMap((read) => {
				if (read.asyncBoundaryId !== boundary.id) return [];

				const resolved = resolveGraphPath(read.source, bindings, aliases);
				if (!resolved) return [];
				if (
					resolved.binding.kind !== 'computed' ||
					resolved.binding.asyncCapable !== true
				) {
					return [];
				}

				return [
					{
						source: read.source,
						graphNodeId: resolved.binding.id,
						path: resolved.path,
					},
				];
			}),
			(read) => `${read.graphNodeId}:${read.path.join('.')}:${read.source}`,
		),
	}));
	return {
		passId: 'payload-arena',
		state: {
			cells,
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
			behaviors,
			elementHandles,
			asyncBoundaries,
			branchSites: input.semanticGraph.branchSites.map((site) => ({
				id: site.id,
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
			(candidate) =>
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
				path: resolved.path,
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
