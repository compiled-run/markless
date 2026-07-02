import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, expressionSourceOrFallback, sourceSpan } from '../../ast/source.ts';
import type { SemanticComponentEdge, SemanticComponentPropBinding } from '../../artifacts.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectExpressionReads } from './collect-expressions.ts';
import { collectObjectPatternAliases } from './collect-aliases.ts';
import type { SemanticGraphWalk, WalkState } from './types.ts';

export function collectComponentProps(component: AnyNode, state: WalkState): void {
	const firstParam = asNodes(component.params)[0];
	if (!firstParam) return;

	if (firstParam.type === 'Identifier') {
		const name = getIdentifierName(firstParam);
		if (!name) return;

		state.graph.graphBindings.push({
			id: `prop:${name}`,
			name,
			kind: 'prop',
			declarationKind: 'const',
			writable: false,
			valueKind: 'object',
		});
		return;
	}

	if (firstParam.type !== 'ObjectPattern') return;

	state.graph.graphBindings.push({
		id: 'prop:props',
		name: 'props',
		kind: 'prop',
		declarationKind: 'const',
		writable: false,
		valueKind: 'object',
	});
	collectObjectPatternAliases(firstParam, 'props', 'const', state);
}

export function collectComponentEdge(
	node: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
): boolean {
	const childComponentName = getElementTagName(node);
	if (!childComponentName || isHostTagName(childComponentName)) return false;
	if (!state.currentComponentName) return false;

	const props = componentPropBindings(node, state);
	state.graph.componentEdges.push({
		id: `component-edge:${state.nextComponentEdgeId++}`,
		parentComponentName: state.currentComponentName,
		childComponentName,
		...componentImportSource(childComponentName, state),
		sourceSpan: sourceSpan(node, state.filename),
		props,
		children: {
			childCount: componentChildCount(node),
		},
		branchScopeIds: [...state.currentBranchScopeIds],
		keyedRepeatScopeIds: [...state.currentKeyedRepeatScopeIds],
	});

	for (const attribute of getElementAttributes(node)) {
		const expression = unwrapExpressionContainer(attribute.value as AnyNode | undefined);
		if (!expression) continue;

		collectExpressionReads(expression, state);
		walk(expression, state);
	}

	return true;
}

function componentPropBindings(
	node: AnyNode,
	state: WalkState,
): ReadonlyArray<SemanticComponentPropBinding> {
	const bindings = graphBindingMap(state.graph);
	const aliases = semanticAliasMap(state.graph);
	const props: SemanticComponentPropBinding[] = [];

	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name) continue;

		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		const source = expression
			? expressionSource(expression, state.source)
			: expressionSourceOrFallback(value, state.source, 'true');
		const span = expression
			? sourceSpan(expression, state.filename)
			: value
				? sourceSpan(value, state.filename)
				: sourceSpan(attribute, state.filename);

		if (expression && isCallbackExpression(expression)) {
			props.push({ name, source, kind: 'callback', sourceSpan: span });
			continue;
		}

		const graph = resolveGraphPath(source, bindings, aliases);
		if (graph) {
			props.push({
				name,
				source,
				kind: 'graph-reference',
				graphNodeId: graph.binding.id,
				graphBindingKind: graph.binding.kind,
				path: graph.path,
				sourceSpan: span,
			});
			continue;
		}

		const kind: 'serializable' | 'opaque' = isSerializableLiteral(expression ?? value)
			? 'serializable'
			: 'opaque';
		props.push({ name, source, kind, sourceSpan: span });
	}

	return props;
}

function componentImportSource(
	childComponentName: string,
	state: WalkState,
): Pick<SemanticComponentEdge, 'importSource' | 'importKind' | 'importedName'> {
	const imported = state.graph.moduleImports.find(
		(item) => item.localName === childComponentName,
	);
	return imported
		? {
				importSource: imported.source,
				importKind: imported.kind,
				importedName: imported.importedName,
			}
		: {};
}

function componentChildCount(node: AnyNode): number {
	return asNodes(node.children).filter((child) => !isIgnorableJsxTextNode(child)).length;
}

function isCallbackExpression(node: AnyNode): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function isSerializableLiteral(node: AnyNode | undefined): boolean {
	return !node || node.type === 'Literal';
}
