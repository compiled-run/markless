import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import type { WalkState } from './types.ts';

export function collectKeyedRepeat(node: AnyNode, state: WalkState): number | null {
	if (!state.currentHostNodeId) return null;

	const itemName = repeatItemName(node);
	const collectionNode = node.right as AnyNode | undefined;
	const keyNode = node.key as AnyNode | undefined;
	if (!itemName || !collectionNode || !keyNode) return null;

	const collectionSource = expressionSource(collectionNode, state.source);
	const keySource = expressionSource(keyNode, state.source);
	const keyPath = itemKeyPath(itemName, keySource);
	if (!collectionSource || !keySource || !keyPath) return null;

	const resolvedCollection = resolveGraphPath(
		collectionSource,
		graphBindingMap(state.graph, state.currentSharedDefinitionId ?? null),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId ?? null),
	);

	const indexName = getIdentifierName(node.index as AnyNode | undefined);
	const repeatIndex = state.graph.keyedRepeats.length;
	state.graph.keyedRepeats.push({
		id: `repeat:${repeatIndex}`,
		parentHostNodeId: state.currentHostNodeId,
		itemName,
		...(indexName ? { indexName } : {}),
		collectionSource,
		...(resolvedCollection
			? {
					collectionGraphNodeId: resolvedCollection.binding.id,
					collectionPath: resolvedCollection.path,
				}
			: {
					collectionPath: [],
				}),
		keySource,
		keyPath,
	});
	return repeatIndex;
}

export function attachKeyedRepeatRowHost(
	node: AnyNode,
	state: WalkState,
	repeatIndex: number | null,
): void {
	if (repeatIndex === null) return;

	const row = firstRepeatRow(node);
	const rowHostNodeId = row ? state.hostIds.get(row) : undefined;
	if (!rowHostNodeId) return;

	const repeat = state.graph.keyedRepeats[repeatIndex];
	if (!repeat) return;

	state.graph.keyedRepeats[repeatIndex] = {
		...repeat,
		rowHostNodeId,
	};
}

function repeatItemName(node: AnyNode): string | null {
	const left = node.left as AnyNode | undefined;
	if (!left) return null;

	if (left.type !== 'VariableDeclaration') return getIdentifierName(left);

	const [declaration] = asNodes(left.declarations);
	return getIdentifierName(declaration?.id as AnyNode | undefined);
}

function itemKeyPath(itemName: string, keySource: string): ReadonlyArray<string> | null {
	const segments = splitStaticGraphPath(keySource);
	if (segments[0] !== itemName) return null;

	return segments.slice(1);
}

function firstRepeatRow(node: AnyNode): AnyNode | undefined {
	const [row] = asNodes((node.body as AnyNode | undefined)?.body);
	if (!row || (row.type !== 'Element' && row.type !== 'JSXElement')) return undefined;

	return row;
}
