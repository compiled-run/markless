import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, expressionSourceOrFallback, sourceSpan } from '../../ast/source.ts';
import type { SemanticComponentEdge, SemanticComponentPropBinding } from '../../artifacts.ts';
import {
	getElementAttributes,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode,
	isMemberTagName,
	isSpreadAttribute,
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
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import {
	type GraphReadScope,
	collectCompositeTemplateExpression,
	pureCompositeReadSources,
	readsWritableGraphCell,
} from './composite-reads.ts';
import {
	callbackPropArityUnsupportedDiagnostic,
	componentPropExpressionUnsupportedDiagnostic,
	componentSpreadUnsupportedDiagnostic,
	memberTagPartMissingDiagnostic,
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
	} else if (isMemberTagName(tagName) && link.missingPart) {
		state.graph.diagnostics.push(
			memberTagPartMissingDiagnostic({
				tagName,
				partName: link.missingPart.partName,
				importSource: link.missingPart.importSource,
				served: link.missingPart.served,
				node,
				filename: state.filename,
			}),
		);
	}

	const props = componentPropBindings(node, state, tagName);
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
	childComponentName: string,
): ReadonlyArray<SemanticComponentPropBinding> {
	// Component-body scope: an unscoped map resolves `checklist` to the shared
	// factory's own local of the same name, which is a different node.
	const scope: GraphReadScope = {
		bindings: graphBindingMap(
			state.graph,
			state.currentSharedDefinitionId ?? null,
			state.currentComponentName,
		),
		aliases: semanticAliasMap(
			state.graph,
			state.currentSharedDefinitionId ?? null,
			state.currentComponentName,
		),
	};
	const { bindings, aliases } = scope;
	const props: SemanticComponentPropBinding[] = [];

	for (const attribute of getElementAttributes(node)) {
		if (isSpreadAttribute(attribute)) {
			const spread = spreadPropBinding(attribute, state, scope, childComponentName);
			if (spread) props.push(spread);
			continue;
		}
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
		const callback =
			expression && isCallbackExpression(expression) ? expression : namedCallback;

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

		// The enclosing family's instance answers through its own return map, so
		// `checklist.allChecked` reaches the computed rather than a state member.
		const graph =
			resolveGraphPath(source, bindings, aliases) ??
			resolveSharedInstanceGraphPath(source, state.graph);
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

		// A recombined expression at the edge - `list.value.includes(item.value)` -
		// resolves to no single node, so without a computed of its own the child is
		// seeded once and never hears about the group again. A props-only expression
		// (`depth - 1`) is settled by the render that read it, so it owes no computed.
		const composite = expression
			? collectCompositeTemplateExpression(expression, state, {
					scope,
					methodCalls: true,
					requireWritableRead: true,
				})
			: null;
		if (composite) {
			props.push({
				name,
				source,
				kind: 'graph-reference',
				graphNodeId: composite.graphNodeId,
				graphBindingKind: 'computed',
				path: [],
				sourceSpan: span,
			});
			continue;
		}

		const literal = serializableLiteralValue(expression ?? value);
		if (!literal.known && expression && readsUnroutedGraphCell(expression, state, scope)) {
			state.graph.diagnostics.push(
				componentPropExpressionUnsupportedDiagnostic({
					propName: name,
					source,
					childComponentName,
					node: expression,
					filename: state.filename,
				}),
			);
			continue;
		}
		props.push(
			literal.known
				? { name, source, kind: 'serializable', value: literal.value, sourceSpan: span }
				: { name, source, kind: 'opaque', sourceSpan: span },
		);
	}

	return props;
}

/**
 * `{...rest}` written on a child COMPONENT tag. What crosses the edge is the
 * props object this component was handed, minus the names its own signature
 * destructured out of the rest binding - a build-time fact of the signature, not
 * of what any consumer passes. Anything else spread onto a component tag is
 * refused rather than dropped: the child would render without it and nothing
 * would say so.
 */
function spreadPropBinding(
	attribute: AnyNode,
	state: WalkState,
	scope: GraphReadScope,
	childComponentName: string,
): SemanticComponentPropBinding | null {
	const expression = unwrapExpressionContainer(
		(attribute.argument ?? attribute.value) as AnyNode | undefined,
	);
	if (!expression) return null;
	const source = expressionSource(expression, state.source);
	const span = sourceSpan(expression, state.filename);
	const resolved = resolveGraphPath(source, scope.bindings, scope.aliases);
	if (!resolved || resolved.binding.kind !== 'prop') {
		state.graph.diagnostics.push(
			componentSpreadUnsupportedDiagnostic({
				source,
				childComponentName,
				node: expression,
				filename: state.filename,
			}),
		);
		return null;
	}
	return {
		name: `...${source}`,
		source,
		kind: 'spread',
		graphNodeId: resolved.binding.id,
		path: resolved.path,
		// A rest binding excludes whole names, so only the one-segment paths name
		// something a spread could have carried.
		excludeNames: (scope.aliases.get(source)?.excludedPaths ?? []).flatMap((excluded) =>
			excluded.length === 1 && excluded[0] !== undefined ? [excluded[0]] : [],
		),
		...(span ? { sourceSpan: span } : {}),
	};
}

/**
 * True when a prop expression reads a state cell or a computed value but this
 * pass could not build a reactive route for it. Seeding the child from a value
 * like that renders the placeholder the shared factory was declared with and
 * never moves again, so the compiler refuses instead of shipping it.
 */
function readsUnroutedGraphCell(
	expression: AnyNode,
	state: WalkState,
	scope: GraphReadScope,
): boolean {
	const readSources = pureCompositeReadSources(expression, state, { methodCalls: true });
	if (readSources) return readsWritableGraphCell(readSources, state, scope);
	// An expression this pass cannot decompose still fails closed when any member
	// path inside it names a graph cell.
	const sources: string[] = [];
	walkNode(expression, (inner) => {
		if (inner.type === 'MemberExpression' && inner.computed !== true) {
			sources.push(expressionSource(inner, state.source));
		}
	});
	return readsWritableGraphCell(sources, state, scope);
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
	readonly missingPart?: {
		readonly partName: string;
		readonly importSource: string;
		readonly served: ReadonlyArray<string>;
	};
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
	if (declared) return { childComponentName: declared.componentName, importSource };
	// The module answered and does not serve this name, so the miss is a fact
	// rather than a link that has not happened yet.
	return {
		...unresolved,
		missingPart: {
			partName: exportPath[0]!,
			importSource: importSource.importSource,
			served: moduleInterface.render.components.flatMap((candidate) =>
				candidate.exportName ? [candidate.exportName] : [],
			),
		},
	};
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
