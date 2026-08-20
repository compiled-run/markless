import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, expressionSourceOrFallback, sourceSpan } from '../../ast/source.ts';
import type { SemanticComponentEdge, SemanticComponentPropBinding } from '../../artifacts.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode,
	isMemberTagName,
	memberTagPropertyPath,
	memberTagRootName,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectExpressionReads } from './collect-expressions.ts';
import { collectObjectPatternAliases } from './collect-aliases.ts';
import {
	callbackPropArityUnsupportedDiagnostic,
	memberTagUnresolvedDiagnostic,
} from './diagnostics.ts';
import type { SemanticGraphWalk, WalkState } from './types.ts';

export function collectComponentProps(component: AnyNode, state: WalkState): void {
	const firstParam = asNodes(component.params)[0];
	if (!firstParam || !state.currentComponentId || !state.currentComponentName) return;
	const span = sourceSpan(firstParam, state.filename);
	if (!span) return;
	const bindingId = `binding:${span.start}:${span.end}`;

	if (firstParam.type === 'Identifier') {
		const name = getIdentifierName(firstParam);
		if (!name) return;

		state.graph.graphBindings.push({
			id: `prop:${name}`,
			name,
			kind: 'prop',
			bindingId,
			componentId: state.currentComponentId,
			componentName: state.currentComponentName,
			sourceSpan: span,
			declarationKind: 'const',
			writable: false,
			valueKind: 'object',
		});
		state.graph.componentPropBindings.push({
			componentId: state.currentComponentId,
			componentName: state.currentComponentName,
			bindingId,
			localName: name,
			propPath: [],
			sourceSpan: span,
		});
		return;
	}

	if (firstParam.type !== 'ObjectPattern') return;

	state.graph.graphBindings.push({
		id: 'prop:props',
		name: 'props',
		kind: 'prop',
		bindingId,
		componentId: state.currentComponentId,
		componentName: state.currentComponentName,
		sourceSpan: span,
		declarationKind: 'const',
		writable: false,
		valueKind: 'object',
	});
	collectObjectPatternAliases(firstParam, 'props', 'const', state, {
		componentId: state.currentComponentId,
		componentName: state.currentComponentName,
		propPath: [],
	});
}

export function collectComponentEdge(
	node: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
): boolean {
	const tagName = getElementTagName(node);
	if (!tagName || isHostTagName(tagName)) return false;
	if (!state.currentComponentName) return false;

	// A member tag off a local object names that object's component directly.
	const localTarget = state.memberTagTargets.get(tagName) ?? tagName;
	const link = resolveImportedChildComponent(localTarget, state);
	const childComponentName = link.childComponentName;
	const importSource = link.importSource;
	if (isMemberTagName(childComponentName) && !importSource.importSource) {
		state.graph.diagnostics.push(
			memberTagUnresolvedDiagnostic({
				tagName,
				rootName: memberTagRootName(tagName),
				node,
				filename: state.filename,
			}),
		);
	}

	const props = componentPropBindings(node, state);
	state.graph.componentEdges.push({
		id: `component-edge:${state.nextComponentEdgeId++}`,
		parentComponentName: state.currentComponentName,
		childComponentName,
		...(state.currentAsyncBoundaryId ? { asyncBoundaryId: state.currentAsyncBoundaryId } : {}),
		...importSource,
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
	// Keep the legacy edge projection stable until bound-symbol emission consumes
	// the scoped capture routes introduced by this package.
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
		const expressionSpan = expression ? sourceSpan(expression, state.filename) : undefined;
		const localBindingId = expressionSpan
			? state.resolvedComponentLocalBindingsBySpan.get(
					`${expressionSpan.start}:${expressionSpan.end}`,
				)
			: undefined;
		const localBinding = localBindingId
			? state.componentLocalBindings.get(localBindingId)
			: undefined;
		// Deliberately bounded: only the declaration's direct function initializer
		// is callable here. Identifier aliases do not inherit callback identity.
		const namedCallback =
			localBinding?.declaration.writeCount === 1 ? localBinding.initializerNode : undefined;
		const callback = expression && isCallbackExpression(expression) ? expression : namedCallback;

		if (callback && isCallbackExpression(callback)) {
			const parameterNodes = asNodes(callback.params);
			const unsupportedParameterReason = callbackParameterUnsupportedReason(parameterNodes);
			if (unsupportedParameterReason) {
				state.graph.diagnostics.push(
					callbackPropArityUnsupportedDiagnostic({
						propName: name,
						parameterCount: parameterNodes.length,
						reason: unsupportedParameterReason,
						callback,
						filename: state.filename,
					}),
				);
				continue;
			}

			props.push({
				name,
				source: expressionSource(callback, state.source),
				kind: 'callback',
				parameters: parameterNodes.map((parameter) =>
					expressionSource(parameter, state.source),
				),
				sourceSpan: sourceSpan(callback, state.filename),
			});
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

		const literal = serializableLiteralValue(expression ?? value);
		props.push(
			literal.known
				? { name, source, kind: 'serializable', value: literal.value, sourceSpan: span }
				: { name, source, kind: 'opaque', sourceSpan: span },
		);
	}

	return props;
}

function componentImportSource(
	childComponentName: string,
	state: WalkState,
): Pick<SemanticComponentEdge, 'importSource' | 'importKind' | 'importedName'> {
	// Member tags resolve through their root identifier (`checkbox` in `checkbox.root`).
	const localName = memberTagRootName(childComponentName);
	const imported = state.graph.moduleImports.find((item) => item.localName === localName);
	return imported
		? {
				importSource: imported.source,
				importKind: imported.kind,
				importedName: imported.importedName,
			}
		: {};
}

// Maps a tag's local name (aliased import or barrel member path) to the component its module declares.
function resolveImportedChildComponent(
	localTarget: string,
	state: WalkState,
): {
	readonly childComponentName: string;
	readonly importSource: Pick<
		SemanticComponentEdge,
		'importSource' | 'importKind' | 'importedName'
	>;
} {
	const importSource = componentImportSource(localTarget, state);
	const unresolved = { childComponentName: localTarget, importSource };
	if (!importSource.importSource) return unresolved;
	const moduleInterface = state.importedModuleInterfaces[importSource.importSource];
	if (!moduleInterface) return unresolved;

	const exportPath = [
		...(importSource.importKind === 'namespace'
			? []
			: importSource.importKind === 'default'
				? ['default']
				: [importSource.importedName ?? memberTagRootName(localTarget)]),
		...memberTagPropertyPath(localTarget),
	];

	const linked = moduleInterface.linkedComponents?.find(
		(candidate) =>
			candidate.exportPath.length === exportPath.length &&
			candidate.exportPath.every((part, index) => part === exportPath[index]),
	);
	if (linked) {
		return {
			childComponentName: linked.componentName,
			importSource: {
				importSource: linked.source,
				importKind: linked.importKind,
				...(linked.importedName ? { importedName: linked.importedName } : {}),
			},
		};
	}

	if (exportPath.length !== 1) return unresolved;
	const declared = moduleInterface.render.components.find(
		(candidate) => candidate.exportName === exportPath[0],
	);
	return declared
		? { childComponentName: declared.componentName, importSource }
		: unresolved;
}

function componentChildCount(node: AnyNode): number {
	return asNodes(node.children).filter((child) => !isIgnorableJsxTextNode(child)).length;
}

function isCallbackExpression(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

function callbackParameterUnsupportedReason(parameters: ReadonlyArray<AnyNode>): string | null {
	if (parameters.length > 1) return 'it declares more than one parameter';
	const parameter = parameters[0];
	if (!parameter) return null;
	if (parameter.type === 'Identifier') return null;
	if (parameter.type === 'ObjectPattern') {
		const properties = asNodes(parameter.properties);
		return properties.some(
			(property) =>
				property.type === 'RestElement' ||
				(property.type === 'Property' &&
					(property.value as AnyNode | undefined)?.type === 'AssignmentPattern'),
		)
			? 'its top-level object pattern contains a default or rest binding'
			: null;
	}
	if (parameter.type === 'ArrayPattern') {
		return asNodes(parameter.elements).some(
			(element) => element.type === 'AssignmentPattern' || element.type === 'RestElement',
		)
			? 'its top-level array pattern contains a default or rest binding'
			: null;
	}
	return 'its parameter uses a default or rest binding';
}

function serializableLiteralValue(
	node: AnyNode | undefined,
): { readonly known: true; readonly value: unknown } | { readonly known: false } {
	if (!node) return { known: true, value: true };
	if (node.type !== 'Literal') return { known: false };

	return { known: true, value: node.value };
}
