import {
	asNodes,
	childNodes,
	getIdentifierName,
	unwrapTypeAssertion,
	type AnyNode,
} from '../../ast/nodes.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import { mintTemplateExpressionComputed, pureCompositeReadSources } from './composite-reads.ts';
import { collectGraphDependencies } from './collect-async.ts';
import { inlineRenderLocals } from './render-local-inline.ts';
import { splitStaticGraphPath } from '../../artifact-helpers/graph-paths.ts';
import type { SemanticKeyedRepeat } from '../../artifacts.ts';
import type { WalkState } from './types.ts';

// Row handlers take their item from the repeat's graph node, so an off-graph collection
// they sit under is lifted into a synthetic computed when the browser can recompute it.
export type RowHandlerCollection =
	| { readonly kind: 'no-row-handlers' | 'writes-row-item' }
	| { readonly kind: 'lifted'; readonly graphNodeId: string }
	| { readonly kind: 'unliftable'; readonly handlerName: string; readonly reason: UnwiredReason };

export type UnwiredReason =
	| { readonly kind: 'nested'; readonly enclosingItemName: string }
	| { readonly kind: 'render-local'; readonly name: string }
	| { readonly kind: 'opaque' };

export function enclosingKeyedRepeat(state: WalkState): SemanticKeyedRepeat | undefined {
	const enclosingId = state.currentKeyedRepeatScopeIds.at(-1);
	return enclosingId
		? state.graph.keyedRepeats.find((repeat) => repeat.id === enclosingId)
		: undefined;
}

// `group.items` inside `@for (const group of ...)`: each enclosing row reads its own rows.
export function enclosingRowItemPath(
	collectionSource: string,
	enclosing: SemanticKeyedRepeat,
): ReadonlyArray<string> | null {
	const [root, ...path] = splitStaticGraphPath(collectionSource);
	return root === enclosing.itemName && path.length > 0 ? path : null;
}

// Each enclosing row wires its own instance of a nested repeat, found through the enclosing
// row, so a nested repeat whose enclosing rows have no record cannot be wired at all.
export function nestedRowHandlers(
	forNode: AnyNode,
	enclosing: SemanticKeyedRepeat,
): RowHandlerCollection | null {
	if (!enclosing.indexKey && (enclosing.collectionGraphNodeId || enclosing.enclosingItemPath))
		return null;
	const handlerName = firstRowHandlerName(forNode.body as AnyNode | undefined);
	return handlerName
		? {
				kind: 'unliftable',
				handlerName,
				reason: { kind: 'nested', enclosingItemName: enclosing.itemName },
			}
		: null;
}

export function liftRowHandlerCollection(
	forNode: AnyNode,
	collectionNode: AnyNode,
	itemName: string,
	state: WalkState,
): RowHandlerCollection {
	const handlerName = firstRowHandlerName(forNode.body as AnyNode | undefined);
	if (!handlerName) return { kind: 'no-row-handlers' };
	// Writing into a plain array's row has no graph element to land on; the symbol
	// modules pass already refuses that, naming the row rather than a lifted node.
	if (writesName(forNode.body as AnyNode | undefined, itemName))
		return { kind: 'writes-row-item' };
	const collection = unwrapTypeAssertion(collectionNode) ?? collectionNode;
	const inlined = inlineRenderLocals(collection, state);
	if (inlined.kind !== 'inlined')
		return {
			kind: 'unliftable',
			handlerName,
			reason:
				inlined.kind === 'row-item'
					? { kind: 'nested', enclosingItemName: inlined.name }
					: { kind: 'render-local', name: inlined.name },
		};
	// A collection spelled with body locals reads what their definitions read.
	const readSources =
		inlined.definitions.length === 0
			? (pureCompositeReadSources(collection, state, { methodCalls: true }) ??
				dependencySources([collection], state))
			: dependencySources([collection, ...inlined.definitions], state);
	const lifted = mintTemplateExpressionComputed(
		`() => ${inlined.source}`,
		readSources,
		state,
		false,
		undefined,
		true,
	);
	return lifted
		? { kind: 'lifted', graphNodeId: lifted.graphNodeId }
		: { kind: 'unliftable', handlerName, reason: { kind: 'opaque' } };
}

function dependencySources(nodes: ReadonlyArray<AnyNode>, state: WalkState): ReadonlyArray<string> {
	return [
		...new Set(
			nodes.flatMap((node) =>
				collectGraphDependencies(node, state).map((read) => read.source),
			),
		),
	];
}

function firstRowHandlerName(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') return null;
	if (node.type === 'Element' || node.type === 'JSXElement') {
		const tagName = getElementTagName(node);
		if (tagName && isHostTagName(tagName))
			for (const attribute of getElementAttributes(node)) {
				const name = getIdentifierName(attribute.name as AnyNode | undefined);
				if (
					name &&
					/^on[A-Z]/.test(name) &&
					unwrapExpressionContainer(attribute.value as AnyNode | undefined)
				)
					return name;
			}
		for (const child of asNodes(node.children)) {
			const found = firstRowHandlerName(child);
			if (found) return found;
		}
		return null;
	}
	for (const child of childNodes(node)) {
		const found = firstRowHandlerName(child);
		if (found) return found;
	}
	return null;
}

function writesName(node: AnyNode | undefined, name: string): boolean {
	if (!node) return false;
	const target =
		node.type === 'AssignmentExpression'
			? (node.left as AnyNode | undefined)
			: node.type === 'UpdateExpression'
				? (node.argument as AnyNode | undefined)
				: undefined;
	if (target && rootName(target) === name) return true;
	const attributeValues =
		node.type === 'Element' || node.type === 'JSXElement'
			? getElementAttributes(node).map((attribute) => attribute.value as AnyNode | undefined)
			: [];
	return [...attributeValues, ...childNodes(node)].some((child) => writesName(child, name));
}

function rootName(node: AnyNode): string | null {
	let current: AnyNode | undefined = unwrapTypeAssertion(node);
	while (current?.type === 'MemberExpression')
		current = unwrapTypeAssertion(current.object as AnyNode | undefined);
	return getIdentifierName(current);
}
