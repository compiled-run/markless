import { asNodes, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import type {
	SemanticGraphAlias,
	SemanticGraphBinding,
	SemanticGraphDependency,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { repeatRowBindsName } from './collect-repeat.ts';
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import type { WalkState } from './types.ts';

/**
 * One recombined expression - a ternary, a comparison, a template literal, a
 * method call on a read value - and the graph reads inside it. Both the element
 * collector (attribute and text positions) and the component collector (props
 * written on a child tag) mint the same synthetic computed from what is here, so
 * the two positions agree about what is reactive.
 */
export type GraphReadScope = {
	readonly bindings: ReadonlyMap<string, SemanticGraphBinding>;
	readonly aliases: ReadonlyMap<string, SemanticGraphAlias>;
};

/**
 * Whether a method call on a read value counts as part of the read.
 *
 * A component edge says yes: `checked={group.value.includes(item.value)}` is the
 * only way to say "this item's membership", and with no route the child is seeded
 * once from a placeholder. A template position says no, deliberately: nothing
 * there is unexpressible without it, and a computed minted for every `.format()`
 * and `.toFixed()` in a page's text is cost with no behavior behind it. Widening
 * the template positions is its own change, with its own byte measurement.
 */
/**
 * Whether a unary operator standing over the whole expression counts as part of
 * the read.
 *
 * A component edge says yes: `tall={!board.wide}` is the plainest way to write an
 * inverted flag, and the reads under the operator are already decomposed exactly
 * as `board.wide === false` decomposes them. Left out, the negation missed the
 * lift and fell through to the refusal, so the prop never reached the child. A
 * template position keeps the narrower gate: its byte output is measured, and
 * widening it is its own change with its own measurement.
 */
export type CompositeReadOptions = {
	readonly methodCalls?: boolean;
	readonly unaryOperators?: boolean;
};

export function isCompositeTemplateExpression(
	node: AnyNode,
	options: CompositeReadOptions = {},
): boolean {
	return (
		node.type === 'ConditionalExpression' ||
		node.type === 'BinaryExpression' ||
		node.type === 'LogicalExpression' ||
		node.type === 'TemplateLiteral' ||
		(options.methodCalls === true && isMethodCallExpression(node)) ||
		// `delete` mutates rather than reads; the read collector already refuses it,
		// so an operator that is not a pure value still reaches the loud refusal.
		(options.unaryOperators === true && node.type === 'UnaryExpression')
	);
}

// A call belongs to a read only when it is a method ON a read value, the way
// `ticked.includes(value)` is. A bare `format(value)` names a function whose body
// this pass cannot see, so nothing says what would move its result.
function isMethodCallExpression(node: AnyNode): boolean {
	if (node.type !== 'CallExpression') return false;
	const callee = node.callee as AnyNode | undefined;
	return callee?.type === 'MemberExpression' && callee.computed !== true;
}

export function pureCompositeReadSources(
	node: AnyNode | undefined,
	state: WalkState,
	options: CompositeReadOptions = {},
): ReadonlyArray<string> | null {
	if (!node) return [];
	if (node.type === 'ChainExpression') {
		return pureCompositeReadSources(node.expression as AnyNode | undefined, state, options);
	}
	if (isLiteralExpression(node)) return [];
	if (node.type === 'Identifier') {
		// `undefined` is an Identifier to the parser but a value here, like false
		// or null; reporting it as a read source kills the computed mint.
		const source = expressionSource(node, state.source);
		return source === 'undefined' ? [] : [source];
	}
	if (node.type === 'MemberExpression') return memberReadSources(node, state);
	if (node.type === 'CallExpression') {
		return options.methodCalls === true ? methodCallReadSources(node, state, options) : null;
	}
	if (node.type === 'ConditionalExpression') {
		return joinReadSources([
			pureCompositeReadSources(node.test as AnyNode | undefined, state, options),
			pureCompositeReadSources(node.consequent as AnyNode | undefined, state, options),
			pureCompositeReadSources(node.alternate as AnyNode | undefined, state, options),
		]);
	}
	if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
		return joinReadSources([
			pureCompositeReadSources(node.left as AnyNode | undefined, state, options),
			pureCompositeReadSources(node.right as AnyNode | undefined, state, options),
		]);
	}
	if (node.type === 'UnaryExpression') {
		if (node.operator === 'delete') return null;
		return pureCompositeReadSources(node.argument as AnyNode | undefined, state, options);
	}
	if (node.type === 'TemplateLiteral') {
		return joinReadSources(
			asNodes(node.expressions).map((part) =>
				pureCompositeReadSources(part, state, options),
			),
		);
	}
	return null;
}

// The receiver and the arguments are the whole dependency set of a method call:
// what the method does with them is opaque, but nothing else can move its answer.
function methodCallReadSources(
	node: AnyNode,
	state: WalkState,
	options: CompositeReadOptions,
): ReadonlyArray<string> | null {
	if (!isMethodCallExpression(node)) return null;
	const callee = node.callee as AnyNode;
	const receiver = pureCompositeReadSources(callee.object as AnyNode | undefined, state, options);
	if (!receiver) return null;
	return joinReadSources([
		receiver,
		...asNodes(node.arguments).map((argument) =>
			pureCompositeReadSources(argument, state, options),
		),
	]);
}

function memberReadSources(node: AnyNode, state: WalkState): ReadonlyArray<string> | null {
	if (node.computed === true && !isLiteralExpression(node.property as AnyNode | undefined)) {
		return null;
	}
	const object = node.object as AnyNode | undefined;
	if (object?.type === 'CallExpression' || object?.type === 'NewExpression') return null;
	const source = expressionSource(node, state.source);
	return source ? [source] : null;
}

export function joinReadSources(
	parts: ReadonlyArray<ReadonlyArray<string> | null>,
): ReadonlyArray<string> | null {
	const joined: string[] = [];
	for (const part of parts) {
		if (!part) return null;
		joined.push(...part);
	}
	return [...new Set(joined)];
}

function isLiteralExpression(node: AnyNode | undefined): boolean {
	return (
		node?.type === 'Literal' ||
		node?.type === 'StringLiteral' ||
		node?.type === 'NumericLiteral' ||
		node?.type === 'BooleanLiteral' ||
		node?.type === 'NullLiteral'
	);
}

export function collectCompositeTemplateExpression(
	node: AnyNode,
	state: WalkState,
	options: CompositeReadOptions & {
		readonly requireWritableRead?: boolean;
		readonly scope?: GraphReadScope;
	} = {},
): { readonly graphNodeId: string } | null {
	if (!isCompositeTemplateExpression(node, options)) return null;

	const readSources = pureCompositeReadSources(node, state, options);
	if (!readSources) return null;

	return mintTemplateExpressionComputed(
		`() => ${expressionSource(node, state.source)}`,
		readSources,
		state,
		options.requireWritableRead === true,
		options.scope,
	);
}

/**
 * Mints the synthetic computed that stands behind one recombined expression, so
 * every graph read inside it wakes a single DOM update instead of none.
 */
export function mintTemplateExpressionComputed(
	functionSource: string,
	readSources: ReadonlyArray<string>,
	state: WalkState,
	requireWritableRead = false,
	scope?: GraphReadScope,
): { readonly graphNodeId: string } | null {
	const bindings = scope?.bindings ?? graphBindingMap(state.graph, state.currentSharedDefinitionId);
	const aliases = scope?.aliases ?? semanticAliasMap(state.graph, state.currentSharedDefinitionId);
	const dependencies: SemanticGraphDependency[] = [];
	let readsGraphCell = false;
	for (const source of readSources) {
		// Component scope first: a factory local and the instance local routinely collide.
		// An enclosing row binding outranks both - it is the name's real declaration.
		const resolved = repeatRowBindsName(source, state)
			? null
			: (resolveGraphPath(source, bindings, aliases) ??
				resolveSharedInstanceGraphPath(source, state.graph));
		if (!resolved) return null;
		if (
			resolved.binding.kind !== 'state' &&
			resolved.binding.kind !== 'computed' &&
			resolved.binding.kind !== 'prop'
		) {
			return null;
		}
		if (resolved.binding.kind !== 'prop') readsGraphCell = true;
		dependencies.push({ source, graphNodeId: resolved.binding.id, path: resolved.path });
	}
	if (dependencies.length === 0) return null;
	// No write can move a prop after the render that read it, so props-only owes no record.
	if (requireWritableRead && !readsGraphCell) return null;

	const index = state.graph.graphBindings.filter((binding) =>
		binding.id.startsWith('computed:templateExpression:'),
	).length;
	const graphNodeId = `computed:templateExpression:${index}`;
	state.graph.graphBindings.push({
		id: graphNodeId,
		name: `marklessTemplateExpression${index}`,
		kind: 'computed',
		writable: false,
		async: false,
		asyncCapable: false,
		functionSource,
		dependencies: uniqueDependencies(dependencies),
	});
	return { graphNodeId };
}

/**
 * True when the expression reads a state cell or a computed value - the reads
 * that a later write can move. A props-only expression is settled by the render
 * that produced it, so it owes no reactive route.
 */
export function readsWritableGraphCell(
	readSources: ReadonlyArray<string>,
	state: WalkState,
	scope: GraphReadScope,
): boolean {
	return readSources.some((source) => {
		if (repeatRowBindsName(source, state)) return false;
		const resolved =
			resolveGraphPath(source, scope.bindings, scope.aliases) ??
			resolveSharedInstanceGraphPath(source, state.graph);
		return resolved?.binding.kind === 'state' || resolved?.binding.kind === 'computed';
	});
}

function uniqueDependencies(
	dependencies: ReadonlyArray<SemanticGraphDependency>,
): ReadonlyArray<SemanticGraphDependency> {
	const seen = new Set<string>();
	const unique: SemanticGraphDependency[] = [];
	for (const dependency of dependencies) {
		const key = `${dependency.graphNodeId}:${dependency.path.join('.')}:${dependency.source}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(dependency);
	}
	return unique;
}
