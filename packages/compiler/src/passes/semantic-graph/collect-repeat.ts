import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import {
	repeatCollectionUnreadableDiagnostic,
	repeatKeyIsIndexDiagnostic,
	repeatKeyRequiredDiagnostic,
	repeatKeyUnstableDiagnostic,
} from './diagnostics.ts';
import type { WalkState } from './types.ts';

export function collectKeyedRepeat(node: AnyNode, state: WalkState): number | null {
	if (!state.currentHostNodeId) return null;

	const itemName = repeatItemName(node);
	const collectionNode = node.right as AnyNode | undefined;
	const keyNode = node.key as AnyNode | undefined;
	if (!itemName || !collectionNode) return null;

	const collectionSource = expressionSource(collectionNode, state.source);
	// No readable source means no graph path can resolve from it either, so the
	// repeat would carry neither a graph node nor an authored expression.
	if (!collectionSource) {
		state.graph.diagnostics.push(
			repeatCollectionUnreadableDiagnostic({
				node,
				itemName,
				filename: state.filename,
			}),
		);
		return null;
	}
	if (!keyNode) {
		state.graph.diagnostics.push(
			repeatKeyRequiredDiagnostic({
				node,
				itemName,
				collectionSource,
				filename: state.filename,
			}),
		);
		return null;
	}

	const keySource = expressionSource(keyNode, state.source);
	if (!keySource) return null;

	const indexName = getIdentifierName(node.index as AnyNode | undefined);
	const keyPath = itemKeyPath(itemName, keySource);
	const isIndexKey = Boolean(indexName && keySource === indexName);
	if (!keyPath && !isIndexKey) {
		state.graph.diagnostics.push(
			repeatKeyUnstableDiagnostic({
				keyNode,
				itemName,
				collectionSource,
				keySource,
				filename: state.filename,
			}),
		);
		return null;
	}
	if (isIndexKey && indexName) {
		state.graph.diagnostics.push(
			repeatKeyIsIndexDiagnostic({
				node,
				itemName,
				indexName,
				collectionSource,
				filename: state.filename,
			}),
		);
	}

	const resolvedCollection = resolveGraphPath(
		collectionSource,
		graphBindingMap(state.graph, state.currentSharedDefinitionId ?? null),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId ?? null),
	);

	const repeatIndex = state.graph.keyedRepeats.length;
	state.graph.keyedRepeats.push({
		id: `repeat:${repeatIndex}`,
		parentHostNodeId: state.currentHostNodeId,
		...(state.currentAsyncBoundaryId ? { asyncBoundaryId: state.currentAsyncBoundaryId } : {}),
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
		keyPath: keyPath ?? [],
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
