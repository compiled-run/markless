import { asNodes, getIdentifierName, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import type { SemanticGraphDiagnostic } from '../../artifacts.ts';
import { findSharedInstance, resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import {
	repeatCollectionUndeclaredDiagnostic,
	repeatCollectionUnreadableDiagnostic,
	repeatFrozenRowsDiagnostic,
	repeatKeyIsIndexDiagnostic,
	repeatKeyRequiredDiagnostic,
	repeatKeyUnstableDiagnostic,
} from './diagnostics.ts';
import { firstReactiveRowRead, repeatRowNames } from './repeat-reactivity.ts';
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

	// A component's shared-instance local (`const box = someFamily()`) is a
	// `sharedInstances` row, not a graph binding, and the cell it names carries a
	// sharedDefinitionId that graph-scope filtering drops. Without this second arm
	// the repeat kept `box.items` as an authored expression and the SSR module
	// re-emitted it into a scope with no `box` at all - a first-render
	// ReferenceError with nothing said at build time. Attribute reads already
	// resolve through the same fallback in collect-markup.
	const resolvedCollection =
		resolveGraphPath(
			collectionSource,
			graphBindingMap(state.graph, state.currentSharedDefinitionId ?? null),
			semanticAliasMap(state.graph, state.currentSharedDefinitionId ?? null),
		) ??
		// An enclosing @for's row item owns the name whatever a module-wide
		// instance is called, so the row binding must not reach past itself.
		(repeatRowBindsName(collectionSource, state)
			? null
			: resolveSharedInstanceGraphPath(
					collectionSource,
					state.graph,
					// Defect 46: a null component name matches every instance in the
					// module and the last declaration wins.
					state.currentComponentName,
				));

	if (!resolvedCollection && unresolvedSharedInstanceRoot(collectionSource, state)) {
		state.graph.diagnostics.push(
			sharedInstanceRepeatUnresolvedDiagnostic({
				node,
				itemName,
				collectionSource,
				filename: state.filename,
			}),
		);
		return null;
	}

	const undeclaredRoot = resolvedCollection
		? null
		: undeclaredCollectionRoot(collectionNode, collectionSource, state);
	if (undeclaredRoot) {
		state.graph.diagnostics.push(
			repeatCollectionUndeclaredDiagnostic({
				node,
				itemName,
				collectionSource,
				rootName: undeclaredRoot,
				filename: state.filename,
			}),
		);
		return null;
	}

	// An off-graph collection is a designed server-only path, correct while the
	// rows are static. It is a defect only once a row reads something a later
	// write can move: those rows never reconcile, so the read silently freezes.
	if (!resolvedCollection) {
		const reactiveRead = firstReactiveRowRead(node, state, repeatRowNames(itemName, indexName));
		if (reactiveRead) {
			state.graph.diagnostics.push(
				repeatFrozenRowsDiagnostic({
					node,
					itemName,
					collectionSource,
					rootName: splitStaticGraphPath(collectionSource)[0] ?? collectionSource,
					readSource: reactiveRead.source,
					readKind: reactiveRead.kind,
					filename: state.filename,
				}),
			);
		}
	}

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
		...(isIndexKey ? { indexKey: true as const } : {}),
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

/**
 * True when the collection is rooted in a name this component holds a shared
 * instance under, yet neither resolver could answer for it. The instance local
 * exists only inside the component function, so the authored expression names
 * nothing wherever the repeat is emitted; recording it would ship a build that
 * throws on its first server render.
 *
 * The known shape that lands here is a factory returning its state binding bare
 * (`return box`) instead of a spread object (`return { ...box }`): the bare
 * return registers no returned properties, so `box.items` reaches no graph node.
 */
function unresolvedSharedInstanceRoot(collectionSource: string, state: WalkState): boolean {
	if (repeatRowBindsName(collectionSource, state)) return false;

	const [rootName, propertyName] = splitStaticGraphPath(collectionSource);
	if (!rootName || !propertyName) return false;

	return findSharedInstance(rootName, state.graph, state.currentComponentName) !== null;
}

// Same code as the unreadable-collection refusal: both say this @for has no
// source of rows it could evaluate. The text is specific to the shared-instance
// receiver so the fix is the one the author actually needs.
function sharedInstanceRepeatUnresolvedDiagnostic(input: {
	readonly node: AnyNode;
	readonly itemName: string;
	readonly collectionSource: string;
	readonly filename: string;
}): SemanticGraphDiagnostic {
	const [rootName] = splitStaticGraphPath(input.collectionSource);

	return {
		code: 'MARKLESS_REPEAT_COLLECTION_UNREADABLE',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'This @for collection reaches no cell on its shared instance',
		message: `@for (const ${input.itemName} of ${input.collectionSource}) reads through \`${rootName}\`, a shared instance local of this component, but \`${input.collectionSource}\` resolves to no graph cell. \`${rootName}\` exists only inside the component function, so the rows would be taken from an expression that names nothing where the repeat renders.`,
		why: 'Rows come from a reactive graph read; a shared-instance path that resolves to no cell leaves the repeat with an authored expression whose receiver is undeclared in the emitted scope, which throws on the first server render.',
		primarySpan: sourceSpan(input.node, input.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message: `Return the cell as a property of a spread object from the shared factory, so \`${input.collectionSource}\` names a graph cell. Before: \`shared(() => { const box = state({ items: [] }); return box; })\`; after: \`shared(() => { const box = state({ items: [] }); return { ...box }; })\`.`,
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_REPEAT_COLLECTION_UNREADABLE',
	};
}

/**
 * The root identifier of a collection that reached no graph cell and resolves to
 * no binding at all. Such a name is re-emitted into the server render module,
 * where it throws a ReferenceError on the first render with nothing said at
 * build time. A module constant or an import resolves, and stays supported as an
 * authored collection.
 *
 * Resolution answers this rather than a name lookup, because only resolution can
 * tell an undeclared name from one declared in some other scope of the file. An
 * expression whose root is not a plain identifier chain - a call, a literal, an
 * index into something computed - has no binding to judge and is left alone.
 */
function undeclaredCollectionRoot(
	collectionNode: AnyNode,
	collectionSource: string,
	state: WalkState,
): string | null {
	if (repeatRowBindsName(collectionSource, state)) return null;

	const root = staticRootIdentifier(collectionNode);
	const rootName = getIdentifierName(root);
	if (!root || !rootName || typeof root.start !== 'number') return null;

	return resolvedSymbolAt(state.semantic(), root.start) === null ? rootName : null;
}

/** The identifier a static member chain is rooted in, or null for any other shape. */
function staticRootIdentifier(node: AnyNode): AnyNode | null {
	let current = unwrapTypeAssertion(node);

	while (current?.type === 'MemberExpression' && current.computed !== true) {
		current = unwrapTypeAssertion(current.object as AnyNode | undefined);
	}

	return current?.type === 'Identifier' ? current : null;
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

/**
 * True when an enclosing `@for` declares the name this expression is rooted in,
 * as the row item or as the row index. Such a name is a per-row binding, so no
 * module-level or component-level node may answer for it however the two happen
 * to be spelled - a resolver that answers anyway hands every row one node, and
 * the rows then render identical values with nothing to say so.
 *
 * The test is the one `expressionResidue` already applies to markup residues, so
 * a child's prop and the text beside it read the row's name the same way.
 */
export function repeatRowBindsName(source: string, state: WalkState): boolean {
	if (state.currentKeyedRepeatScopeIds.length === 0) return false;

	return state.currentKeyedRepeatScopeIds.some((scopeId) => {
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === scopeId);
		if (!repeat) return false;

		return [repeat.itemName, repeat.indexName].some(
			(name) => name !== undefined && (source === name || source.startsWith(`${name}.`)),
		);
	});
}
