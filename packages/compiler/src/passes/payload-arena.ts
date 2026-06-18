import type { ProtocolComputedExpression, ProtocolTextSegment } from '@arcade/protocol';
import type {
	PayloadArenaArtifact,
	PayloadArenaInput,
	PayloadBehavior,
	SemanticGraphBinding,
} from '../artifacts.ts';
import {
	resolveGraphPath,
	resolveSharedInstanceGraphPath,
	semanticAliasMap,
	uniqueBy,
} from '../artifact-helpers/graph-paths.ts';
import {
	compilerBinaryExpressionMatcher,
	compilerDoubleQuotedStringLiteralPattern,
	compilerNumberLiteralPattern,
	compilerSingleQuotedStringLiteralPattern,
} from '../source-patterns.ts';

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
		.map((binding) => payloadComputed(binding, bindings, aliases));
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
	const viewDomUpdates = input.semanticGraph.templateReads.flatMap((read) => {
		const resolved = resolvePayloadGraphPath(
			read.source,
			input.semanticGraph,
			bindings,
			aliases,
		);
		if (!resolved) return [];

		return [
			{
				hostNodeId: read.hostNodeId,
				source: read.source,
				graphNodeId: resolved.binding.id,
				path: resolved.path,
				target: domUpdateTarget(read, input.semanticGraph, bindings, aliases),
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

				const resolved = resolvePayloadGraphPath(
					read.source,
					input.semanticGraph,
					bindings,
					aliases,
				);
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
		payloadBehavior(behavior, input.semanticGraph, bindings, aliases),
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

function domUpdateTarget(
	read: PayloadArenaInput['semanticGraph']['templateReads'][number],
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadArenaArtifact['view']['domUpdates'][number]['target'] {
	if (read.target.kind !== 'text') return read.target;

	const segments = textSegmentsForHost(read.hostNodeId, semanticGraph, bindings, aliases);
	if (!segments || segments.length <= 1) return read.target;

	return {
		kind: 'text',
		segments,
	};
}

function textSegmentsForHost(
	hostNodeId: string,
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): ReadonlyArray<ProtocolTextSegment> | undefined {
	const hostNode = semanticGraph.templateNodes.find(
		(node) => node.kind === 'element' && node.hostNodeId === hostNodeId,
	);
	if (!hostNode || hostNode.kind !== 'element') return undefined;

	const childNodes = hostNode.childNodeIds.map((childId) =>
		semanticGraph.templateNodes.find((node) => node.id === childId),
	);
	if (childNodes.some((child) => !child)) return undefined;

	const segments = childNodes.flatMap(
		(child) => textSegment(child!, semanticGraph, bindings, aliases) ?? [],
	);
	return segments.length === childNodes.length ? segments : undefined;
}

function textSegment(
	node: PayloadArenaInput['semanticGraph']['templateNodes'][number],
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): ProtocolTextSegment | undefined {
	if (node.kind === 'text') {
		return {
			kind: 'static',
			value: node.value,
		};
	}
	if (node.kind !== 'binding' || node.target.kind !== 'text') return undefined;

	const resolved = resolvePayloadGraphPath(node.source, semanticGraph, bindings, aliases);
	if (!resolved) return undefined;
	const expression =
		resolved.binding.kind === 'computed' && resolved.binding.async !== true
			? computedExpression(resolved.binding, bindings, aliases)
			: undefined;

	return {
		kind: 'read',
		source: node.source,
		graphNodeId: resolved.binding.id,
		path: resolved.path,
		...(expression ? { expression } : {}),
	};
}

function payloadComputed(
	binding: SemanticGraphBinding,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadArenaArtifact['state']['computed'][number] {
	const expression =
		binding.async === true ? undefined : computedExpression(binding, bindings, aliases);

	return {
		graphNodeId: binding.id,
		name: binding.name,
		async: binding.async === true,
		functionSource: binding.functionSource,
		dependencies: binding.dependencies,
		...(expression ? { expression } : {}),
	};
}

function payloadBehavior(
	behavior: PayloadArenaInput['semanticGraph']['behaviors'][number],
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadBehavior {
	const inputValues = behaviorInputValues(behavior.inputSources, bindings, aliases);
	const inputGraphReads = behaviorInputGraphReads(
		behavior.inputSources,
		semanticGraph,
		bindings,
		aliases,
	);
	if (!inputValues && !inputGraphReads) return behavior;

	return {
		...behavior,
		...(inputValues ? { inputValues } : {}),
		...(inputGraphReads ? { inputGraphReads } : {}),
	};
}

function behaviorInputGraphReads(
	inputSources: ReadonlyArray<string>,
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): PayloadBehavior['inputGraphReads'] | undefined {
	const graphReads = inputSources.flatMap((inputSource, inputIndex) => {
		const resolved = resolvePayloadGraphPath(inputSource, semanticGraph, bindings, aliases);
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

function resolvePayloadGraphPath(
	source: string,
	semanticGraph: PayloadArenaInput['semanticGraph'],
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
) {
	return (
		resolveGraphPath(source, bindings, aliases) ??
		resolveSharedInstanceGraphPath(source, semanticGraph)
	);
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
	if (compilerNumberLiteralPattern.test(valueSource)) {
		const value = Number(valueSource);
		if (Number.isFinite(value)) return { value };
	}

	const stringValue = literalStringValue(valueSource);
	if (stringValue) return stringValue;

	return undefined;
}

function literalStringValue(source: string): BehaviorInputValue | undefined {
	if (compilerDoubleQuotedStringLiteralPattern.test(source)) {
		try {
			return { value: JSON.parse(source) as unknown };
		} catch {
			return undefined;
		}
	}

	if (compilerSingleQuotedStringLiteralPattern.test(source)) {
		return {
			value: source.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
		};
	}

	return undefined;
}

function computedExpression(
	binding: SemanticGraphBinding,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): ProtocolComputedExpression | undefined {
	const source = computedFunctionExpression(binding.functionSource);
	if (!source) return undefined;

	const binary = source.match(compilerBinaryExpressionMatcher);
	if (binary) {
		const { leftSource, operator, rightNumberSource } = binary.groups;
		if (!leftSource || !isProtocolBinaryOperator(operator) || !rightNumberSource) {
			return undefined;
		}

		const left = computedReadExpression(leftSource, bindings, aliases);
		if (!left) return undefined;

		return {
			kind: 'binary',
			operator,
			left,
			right: { kind: 'literal', value: Number(rightNumberSource) },
		};
	}

	return computedReadExpression(source, bindings, aliases);
}

function computedFunctionExpression(functionSource: string | undefined): string | undefined {
	if (!functionSource) return undefined;

	const arrowIndex = functionSource.indexOf('=>');
	if (arrowIndex === -1) return undefined;

	const body = functionSource.slice(arrowIndex + 2).trim();
	if (!body.startsWith('{') || !body.endsWith('}')) return body;

	const statement = body.slice(1, -1).trim();
	if (!statement.startsWith('return')) return body;

	const afterReturn = statement.slice('return'.length);
	if (!/\s/.test(afterReturn[0] ?? '')) return body;

	const expression = afterReturn.trim();
	return (expression.endsWith(';') ? expression.slice(0, -1) : expression).trim();
}

function computedReadExpression(
	source: string,
	bindings: ReadonlyMap<string, SemanticGraphBinding>,
	aliases: ReturnType<typeof semanticAliasMap>,
): ProtocolComputedExpression | undefined {
	const resolved = resolveGraphPath(source, bindings, aliases);
	if (!resolved) return undefined;
	if (resolved.binding.kind !== 'state' && resolved.binding.kind !== 'computed') {
		return undefined;
	}

	return {
		kind: 'read',
		graphNodeId: resolved.binding.id,
		path: resolved.path,
	};
}

function isProtocolBinaryOperator(operator: string | undefined): operator is '+' | '-' | '*' | '/' {
	return operator === '+' || operator === '-' || operator === '*' || operator === '/';
}
