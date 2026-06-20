import type {
	PayloadArenaArtifact,
	PayloadArenaInput,
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
		.filter((binding) => binding.kind === 'computed' && binding.async === true)
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
		const graphBinding = bindings.get(binding.handleName);
		if (!graphBinding || graphBinding.kind !== 'element') return [];

		return [
			{
				hostNodeId: binding.hostNodeId,
				handleId: graphBinding.id,
				name: binding.handleName,
			},
		];
	});
	const asyncBoundaries = input.semanticGraph.asyncBoundaries.map((boundary, index) => ({
		id: boundary.id,
		startAnchor: {
			strategy: 'dom-order-comment' as const,
			index: index * 2,
		},
		endAnchor: {
			strategy: 'dom-order-comment' as const,
			index: index * 2 + 1,
		},
		asyncReads: uniqueBy(
			input.semanticGraph.templateReads.flatMap((read) => {
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
	const behaviors = input.semanticGraph.behaviors.map((behavior) =>
		payloadBehavior(behavior, bindings, aliases),
	);

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
		},
		diagnostics: input.stateLowering.diagnostics,
	};
}

function domUpdateTargetKey(
	target: PayloadArenaArtifact['view']['domUpdates'][number]['target'],
): string {
	if (target.kind === 'attribute') return `attribute:${target.name}`;
	if (target.kind === 'property') return `property:${target.name}`;
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
		if (resolved.binding.kind !== 'state' && resolved.binding.kind !== 'computed') return [];

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

	let value = initialValue;
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
		if (!(segment in value)) return undefined;

		value = (value as Record<string, unknown>)[segment];
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
