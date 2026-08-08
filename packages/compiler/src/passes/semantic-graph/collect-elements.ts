import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	getElementAttributes,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode,
	isSpreadAttribute,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import type {
	SemanticBehavior,
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticGraphBinding,
	SemanticGraphDependency,
	SemanticTemplateBindingTarget,
	SourceSpan,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectComponentEdge } from './collect-components.ts';
import { collectExpressionReads } from './collect-expressions.ts';
import {
	extractSyncPolicyFromHandlers,
	firstDetachedSyncPolicyReference,
	firstSyncPolicyActionCall,
	getHandlerCount,
	hasSyncEventPolicyCandidate,
} from './collect-sync-policy.ts';
import {
	attachHostElementRequiredDiagnostic,
	attributeObjectValueDiagnostic,
	duplicateAttributeDiagnostic,
	duplicateElementHandleDiagnostic,
	elementHandleRequiredDiagnostic,
	elementHandlePropUnsupportedDiagnostic,
	elementHandleRenderReadDiagnostic,
	eventSpreadUnsupportedDiagnostic,
	overlayHostElementRequiredDiagnostic,
	overlayValueUnsupportedDiagnostic,
	spreadStaticSnapshotDiagnostic,
	styleObjectUnsupportedDiagnostic,
	unsupportedRowElementHandleDiagnostic,
	unboundElementHandleDiagnostic,
} from './diagnostics.ts';
import type { MutableSemanticGraphArtifact, SemanticGraphWalk, WalkState } from './types.ts';

export function collectElement(node: AnyNode, state: WalkState, walk: SemanticGraphWalk): void {
	collectComponentEdge(node, state, walk);

	const tagName = getElementTagName(node);
	const previousHost = state.currentHostNodeId;
	// Dynamic <{expr}> elements are host elements whose tag is only known at
	// render time; '*' marks that in host records and planned locators.
	const isHostElement = tagName ? isHostTagName(tagName) : !!getDynamicTagExpression(node);
	let hostNodeId = previousHost;

	if (isHostElement) {
		hostNodeId = `h${state.nextHostId++}`;
		state.hostIds.set(node, hostNodeId);
		state.graph.hostNodes.push({
			id: hostNodeId,
			tagName: tagName ?? '*',
			...(state.currentAsyncBoundaryId
				? {
						asyncBoundaryId: state.currentAsyncBoundaryId,
						asyncBoundaryArm: state.currentAsyncBoundaryArm ?? 0,
					}
				: {}),
		});
		state.currentHostNodeId = hostNodeId;
	}

	collectDuplicateAttributeDiagnostics(node, state, tagName, isHostElement);
	for (const attribute of getElementAttributes(node)) {
		collectAttribute(
			attribute,
			state,
			walk,
			isHostElement ? hostNodeId : null,
			tagName,
			isHostElement,
		);
	}

	const previousTextTarget = state.currentTextTarget;
	for (const child of asNodes(node.children)) {
		state.currentTextTarget =
			isHostElement && isTemplateExpressionChild(child)
				? textExpressionTarget(node, child)
				: null;
		walk(child, state);
	}
	state.currentTextTarget = previousTextTarget;

	state.currentHostNodeId = previousHost;
}

export function collectTemplateExpression(node: AnyNode, state: WalkState): void {
	if (!state.currentHostNodeId) return;

	const expression = node.expression as AnyNode | undefined;
	if (!expression) return;
	const composite = collectCompositeTemplateExpression(expression, state);

	state.graph.templateReads.push({
		hostNodeId: state.currentHostNodeId,
		source: expressionSource(expression, state.source),
		sourceSpan: sourceSpan(expression, state.filename),
		target: state.currentTextTarget ?? { kind: 'text' },
		asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
		computedGraphNodeId: composite?.graphNodeId,
	});
}

function isTemplateExpressionChild(node: AnyNode): boolean {
	return node.type === 'JSXExpressionContainer' || node.type === 'TSRXExpression';
}

function textExpressionTarget(
	host: AnyNode,
	expressionChild: AnyNode,
): SemanticTemplateBindingTarget {
	const children = asNodes(host.children).filter((child) => !isIgnorableJsxTextNode(child));
	const expressionChildren = children.filter(isTemplateExpressionChild);
	if (expressionChildren.length !== 1 || expressionChildren[0] !== expressionChild) {
		return { kind: 'text' };
	}

	const expressionIndex = children.indexOf(expressionChild);
	let prefix = '';
	let suffix = '';
	for (const child of children.slice(0, expressionIndex)) {
		if (!isStaticTextPart(child)) return { kind: 'text' };
		prefix += staticTextValue(child);
	}
	for (const child of children.slice(expressionIndex + 1)) {
		if (!isStaticTextPart(child)) return { kind: 'text' };
		suffix += staticTextValue(child);
	}

	return {
		kind: 'text',
		...(prefix ? { prefix } : {}),
		...(suffix ? { suffix } : {}),
	};
}

function isStaticTextPart(node: AnyNode): boolean {
	return node.type === 'JSXText' || node.type === 'Literal';
}

function collectCompositeTemplateExpression(
	node: AnyNode,
	state: WalkState,
): { readonly graphNodeId: string } | null {
	if (!isCompositeTemplateExpression(node)) return null;

	const readSources = pureCompositeReadSources(node, state);
	if (!readSources) return null;

	const bindings = graphBindingMap(state.graph, state.currentSharedDefinitionId);
	const aliases = semanticAliasMap(state.graph, state.currentSharedDefinitionId);
	const dependencies: SemanticGraphDependency[] = [];
	for (const source of readSources) {
		const resolved = resolveGraphPath(source, bindings, aliases);
		if (!resolved) return null;
		if (
			resolved.binding.kind !== 'state' &&
			resolved.binding.kind !== 'computed' &&
			resolved.binding.kind !== 'prop'
		) {
			return null;
		}
		dependencies.push({ source, graphNodeId: resolved.binding.id, path: resolved.path });
	}
	if (dependencies.length === 0) return null;

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
		functionSource: `() => ${expressionSource(node, state.source)}`,
		dependencies: uniqueDependencies(dependencies),
	});
	return { graphNodeId };
}

function isCompositeTemplateExpression(node: AnyNode): boolean {
	return (
		node.type === 'ConditionalExpression' ||
		node.type === 'BinaryExpression' ||
		node.type === 'LogicalExpression' ||
		node.type === 'TemplateLiteral'
	);
}

function pureCompositeReadSources(
	node: AnyNode | undefined,
	state: WalkState,
): ReadonlyArray<string> | null {
	if (!node) return [];
	if (node.type === 'ChainExpression') {
		return pureCompositeReadSources(node.expression as AnyNode | undefined, state);
	}
	if (isLiteralExpression(node)) return [];
	if (node.type === 'Identifier') return [expressionSource(node, state.source)];
	if (node.type === 'MemberExpression') return memberReadSources(node, state);
	if (node.type === 'ConditionalExpression') {
		return joinReadSources([
			pureCompositeReadSources(node.test as AnyNode | undefined, state),
			pureCompositeReadSources(node.consequent as AnyNode | undefined, state),
			pureCompositeReadSources(node.alternate as AnyNode | undefined, state),
		]);
	}
	if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
		return joinReadSources([
			pureCompositeReadSources(node.left as AnyNode | undefined, state),
			pureCompositeReadSources(node.right as AnyNode | undefined, state),
		]);
	}
	if (node.type === 'UnaryExpression') {
		if (node.operator === 'delete') return null;
		return pureCompositeReadSources(node.argument as AnyNode | undefined, state);
	}
	if (node.type === 'TemplateLiteral') {
		return joinReadSources(
			asNodes(node.expressions).map((part) => pureCompositeReadSources(part, state)),
		);
	}
	return null;
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

function joinReadSources(
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

export function collectConditionalBranchText(node: AnyNode, state: WalkState): void {
	const test = node.test as AnyNode | undefined;
	if (!test) return;

	const consequent = sameHostStaticTextBranch(node.consequent as AnyNode | undefined, state);
	const alternate = sameHostStaticTextBranch(node.alternate as AnyNode | undefined, state);
	if (!consequent || !alternate) return;
	if (consequent.tagName !== alternate.tagName) return;
	if (consequent.staticAttributesKey !== alternate.staticAttributesKey) return;

	const source = expressionSource(test, state.source);
	const sourceSpanValue = sourceSpan(test, state.filename);
	const target = {
		kind: 'text' as const,
		trueValue: consequent.text,
		falseValue: alternate.text,
	};
	for (const hostNodeId of [consequent.hostNodeId, alternate.hostNodeId]) {
		state.graph.templateReads.push({
			hostNodeId,
			source,
			sourceSpan: sourceSpanValue,
			target,
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
		});
	}
}

export function collectElementHandleDiagnostics(graph: MutableSemanticGraphArtifact): void {
	const bindings = graphBindingMap(graph);
	const aliases = semanticAliasMap(graph);
	const validElementHandleBindings: SemanticElementHandleBinding[] = [];
	const moduleElementNames = new Set(
		graph.diagnostics
			.filter((diagnostic) => diagnostic.code === 'MARKLESS_ELEMENT_MODULE_SCOPE')
			.map((diagnostic) => moduleScopeElementName(diagnostic.message))
			.filter((name): name is string => name !== null),
	);

	for (const [bindingIndex, binding] of graph.elementHandleBindings.entries()) {
		const resolved = resolveGraphPath(binding.handleName, bindings, aliases);
		const graphBinding = resolved?.binding;
		if (moduleElementNames.has(binding.handleName)) continue;
		if (binding.keyedRepeatScopeIds.length > 0) {
			const repeatId = binding.keyedRepeatScopeIds[0];
			const repeat = graph.keyedRepeats.find((candidate) => candidate.id === repeatId);
			if (
				binding.keyedRepeatScopeIds.length === 1 &&
				repeat &&
				/^[A-Za-z_$][\w$]*$/.test(binding.handleName) &&
				graphBinding?.kind === 'element' &&
				resolved?.path.length === 0
			) {
				const rowOwned = {
					...binding,
					rowOwner: { repeatId, keyPath: repeat.keyPath },
				};
				graph.elementHandleBindings[bindingIndex] = rowOwned;
				validElementHandleBindings.push(rowOwned);
				continue;
			}
			graph.diagnostics.push(unsupportedRowElementHandleDiagnostic(binding));
			continue;
		}
		const forwarded = resolved
			? resolvePropForwardedElementHandle(binding, resolved, graph)
			: null;
		if (forwarded) {
			validElementHandleBindings.push({
				...binding,
				handleName: forwarded.name,
			});
			continue;
		}
		if (graphBinding?.kind === 'prop') {
			graph.diagnostics.push(elementHandlePropUnsupportedDiagnostic(binding));
			continue;
		}
		if (!graphBinding || graphBinding.kind !== 'element' || resolved.path.length > 0) {
			graph.diagnostics.push(elementHandleRequiredDiagnostic(binding, graphBinding));
			continue;
		}
		validElementHandleBindings.push(binding);
	}

	const firstBindingByHandle = new Map<string, SemanticElementHandleBinding>();
	for (const binding of validElementHandleBindings) {
		if (!firstBindingByHandle.has(binding.handleName)) {
			firstBindingByHandle.set(binding.handleName, binding);
			continue;
		}

		graph.diagnostics.push(duplicateElementHandleDiagnostic(binding));
	}

	const boundHandleNames = new Set(
		validElementHandleBindings.map((binding) => binding.handleName),
	);
	for (const read of graph.templateReads) {
		const resolved = resolveGraphPath(read.source, bindings, aliases);
		if (!resolved || resolved.binding.kind !== 'element') continue;
		const handleName = resolved.binding.name;
		if (resolved.path.length > 0) {
			graph.diagnostics.push(
				elementHandleRenderReadDiagnostic({
					handleName,
					source: read.source,
					sourceSpan: read.sourceSpan,
				}),
			);
			continue;
		}
		if (!boundHandleNames.has(handleName)) {
			graph.diagnostics.push(
				unboundElementHandleDiagnostic({
					handleName,
					source: read.source,
					sourceSpan: read.sourceSpan,
				}),
			);
		}
	}
}

function moduleScopeElementName(message: string): string | null {
	return /^Cannot create element handle "([^"]+)"/.exec(message)?.[1] ?? null;
}

function collectAttribute(
	attribute: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string | null,
	ownerTagName: string | null,
	isHostElement: boolean,
): void {
	if (isSpreadAttribute(attribute)) {
		collectSpreadAttribute(attribute, state, walk, hostNodeId);
		return;
	}

	const attributeName = getIdentifierName(attribute.name as AnyNode | undefined);
	if (!attributeName) return;

	const value = attribute.value as AnyNode | undefined;
	const expressionValue = unwrapExpressionContainer(value);

	if (attributeName === 'attach' && !isHostElement) {
		if (expressionValue) {
			state.graph.diagnostics.push(
				attachHostElementRequiredDiagnostic(ownerTagName, expressionValue, state),
			);
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
		}
		return;
	}

	// overlay on a component element. Unlike attach this fires even with no value,
	// because bare `overlay` is the common form. Silence here would be the worst
	// outcome: overlay cannot be prop-forwarded (a forwarded value is non-literal),
	// so <Dialog overlay /> would elevate nothing and say nothing.
	if (attributeName === 'overlay' && !isHostElement) {
		state.graph.diagnostics.push(
			overlayHostElementRequiredDiagnostic({
				ownerTagName,
				span: sourceSpan(attribute, state.filename),
			}),
		);
		if (expressionValue) {
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
		}
		return;
	}

	if (!hostNodeId) return;

	if (isEventAttribute(attributeName)) {
		const invalidHandler = invalidEventHandlerExpression(attributeName, expressionValue, state);
		if (invalidHandler) {
			state.graph.diagnostics.push(invalidHandler);
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
			return;
		}

		const handlers = eventHandlerExpressions(expressionValue, state);
		const handlerNodes = handlers.map((handler) => handler.node);
		const handlerSources = handlers.map((handler) => handler.source);
		const handlerSpans = handlers.map((handler) => handler.span);
		const handlerParameters = handlerNodes.map(handlerParameterNames);
		const syncPolicy = extractSyncPolicyFromHandlers(handlerNodes, state);
		const hasSyncPolicyCandidate =
			handlerNodes.some((handler) => hasSyncEventPolicyCandidate(handler)) ||
			handlers.some((handler) => firstDetachedSyncPolicyReference(handler.node));
		if (hasSyncPolicyCandidate && !syncPolicy) {
			state.graph.diagnostics.push(
				unextractableSyncPolicyDiagnostic(attributeName, value, handlerNodes, state),
			);
		}
		state.graph.events.push({
			id: `event:${state.nextEventId++}`,
			hostNodeId,
			eventName: normalizeEventName(attributeName),
			handlerCount: getHandlerCount(expressionValue),
			handlerSources,
			handlerSpans,
			handlerParameters,
			hasSyncPolicyCandidate,
			syncPolicy,
		});
		collectExpressionReads(expressionValue, state);
		walk(expressionValue, state);
		return;
	}

	if (attributeName === 'attach') {
		if (expressionValue) {
			for (const behavior of behaviorExpressions(expressionValue)) {
				state.graph.behaviors.push({
					hostNodeId,
					...behaviorSourceParts(behavior, state),
					...(state.currentKeyedRepeatScopeIds.length > 0
						? { keyedRepeatScopeIds: [...state.currentKeyedRepeatScopeIds] }
						: {}),
				});
			}
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
		}
		return;
	}

	if (attributeName === 'el') {
		if (expressionValue) {
			state.graph.elementHandleBindings.push({
				hostNodeId,
				handleName: expressionSource(expressionValue, state.source),
				componentName: state.currentComponentName ?? undefined,
				sourceSpan: sourceSpan(expressionValue, state.filename),
				keyedRepeatScopeIds: [...state.currentKeyedRepeatScopeIds],
			});
		}
		return;
	}

	// Must sit above the generic attribute branch below: without it a non-literal
	// overlay falls through and becomes a real DOM attribute binding named
	// "overlay", which is exactly the silent lowering the diagnostic exists to stop.
	if (attributeName === 'overlay') {
		const elevated = overlayLiteralValue(value, expressionValue);
		if (elevated === null) {
			const invalid = expressionValue ?? (value as AnyNode);
			state.graph.diagnostics.push(
				overlayValueUnsupportedDiagnostic({
					source: expressionSource(invalid, state.source),
					carrier: 'attribute',
					span: sourceSpan(invalid, state.filename),
				}),
			);
			if (expressionValue) {
				collectExpressionReads(expressionValue, state);
				walk(expressionValue, state);
			}
			return;
		}

		// overlay={false} is the absent case: no record, no diagnostic, no attribute.
		if (elevated) {
			state.graph.overlays.push({
				hostNodeId,
				componentName: state.currentComponentName ?? undefined,
				order: state.graph.overlays.length,
				...(state.currentKeyedRepeatScopeIds.length > 0
					? { keyedRepeatScopeIds: [...state.currentKeyedRepeatScopeIds] }
					: {}),
			});
		}
		return;
	}

	const conditionalClass = conditionalClassTarget(attributeName, expressionValue);
	if (conditionalClass) {
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(conditionalClass.test, state.source),
			sourceSpan: sourceSpan(conditionalClass.test, state.filename),
			target: conditionalClass.target,
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
		});
		walk(expressionValue, state);
		return;
	}

	if (expressionValue && expressionValue.type !== 'Literal') {
		const attributeDiagnostic = attributeValueDiagnostic(attributeName, expressionValue, state);
		if (attributeDiagnostic) state.graph.diagnostics.push(attributeDiagnostic);
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(expressionValue, state.source),
			sourceSpan: sourceSpan(expressionValue, state.filename),
			target: bindingTargetForAttribute(attributeName),
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
		});
		walk(expressionValue, state);
	}
}

function collectDuplicateAttributeDiagnostics(
	node: AnyNode,
	state: WalkState,
	tagName: string | null,
	isHostElement: boolean,
): void {
	if (!isHostElement) return;
	const seen = new Map<string, AnyNode>();
	for (const attribute of getElementAttributes(node)) {
		if (isSpreadAttribute(attribute)) continue;
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		// overlay is deliberately absent from this skip list: <div overlay overlay>
		// is still a duplicate attribute and should keep firing MARKLESS_ATTRIBUTE_DUPLICATE.
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') continue;
		const previous = seen.get(name);
		if (previous) {
			state.graph.diagnostics.push(
				duplicateAttributeDiagnostic({
					tagName,
					attributeName: name,
					duplicate: attribute,
					filename: state.filename,
				}),
			);
			continue;
		}
		seen.set(name, attribute);
	}
}

function collectSpreadAttribute(
	attribute: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string | null,
): void {
	const argument = attribute.argument as AnyNode | undefined;
	if (!argument) return;
	if (!hostNodeId) {
		walk(argument, state);
		return;
	}

	const spreadSource = expressionSource(argument, state.source);
	const objectKeys = staticObjectKeys(resolveStaticObjectExpression(argument, state));
	const eventKeys = objectKeys.filter(isSpreadEventKey);
	if (eventKeys.length > 0) {
		state.graph.diagnostics.push(
			eventSpreadUnsupportedDiagnostic({
				spreadSource,
				keys: eventKeys,
				node: argument,
				filename: state.filename,
			}),
		);
		walk(argument, state);
		return;
	}

	// Separate from isSpreadEventKey on purpose: that key set feeds an
	// event-specific diagnostic. A spread can never carry overlay, because the
	// mark has to be readable as a literal on the element itself.
	if (objectKeys.includes('overlay')) {
		state.graph.diagnostics.push(
			overlayValueUnsupportedDiagnostic({
				source: spreadSource,
				carrier: 'spread',
				span: sourceSpan(argument, state.filename),
			}),
		);
		walk(argument, state);
		return;
	}

	const resolved = resolveGraphPath(
		spreadSource,
		graphBindingMap(state.graph),
		semanticAliasMap(state.graph),
	);
	if (resolved?.binding.kind === 'state' || resolved?.binding.kind === 'computed') {
		state.graph.diagnostics.push(
			spreadStaticSnapshotDiagnostic({
				spreadSource,
				node: argument,
				filename: state.filename,
			}),
		);
	}
	walk(argument, state);
}

function attributeValueDiagnostic(
	attributeName: string,
	expressionValue: AnyNode,
	state: WalkState,
): SemanticGraphDiagnostic | null {
	const valueSource = expressionSource(expressionValue, state.source);
	if (isLowercaseEventAttributeName(attributeName) && isFunctionExpressionLike(expressionValue)) {
		return attributeObjectValueDiagnostic({
			attributeName,
			valueSource,
			node: expressionValue,
			filename: state.filename,
			eventSuggestion: eventAttributeSuggestion(attributeName),
		});
	}

	const resolved = resolveGraphPath(
		valueSource,
		graphBindingMap(state.graph),
		semanticAliasMap(state.graph),
	);
	const isObjectValue =
		expressionValue.type === 'ObjectExpression' ||
		expressionValue.type === 'ArrayExpression' ||
		(resolved?.path.length === 0 &&
			(resolved.binding.valueKind === 'object' || resolved.binding.valueKind === 'array'));
	if (!isObjectValue) return null;
	if (attributeName === 'style') {
		return styleObjectUnsupportedDiagnostic({
			valueSource,
			node: expressionValue,
			filename: state.filename,
		});
	}
	return attributeObjectValueDiagnostic({
		attributeName,
		valueSource,
		node: expressionValue,
		filename: state.filename,
	});
}

function resolvePropForwardedElementHandle(
	binding: SemanticElementHandleBinding,
	resolved: {
		readonly binding: SemanticGraphBinding;
		readonly path: ReadonlyArray<string>;
	},
	graph: MutableSemanticGraphArtifact,
): { readonly name: string } | null {
	if (resolved.binding.kind !== 'prop' || !binding.componentName) return null;

	const propName = resolved.path[0];
	if (!propName || resolved.path.length !== 1) return null;

	const edgeProp = graph.componentEdges
		.filter((edge) => edge.childComponentName === binding.componentName)
		.flatMap((edge) => edge.props)
		.find(
			(prop) =>
				prop.name === propName &&
				prop.kind === 'graph-reference' &&
				prop.graphBindingKind === 'element' &&
				prop.path.length === 0,
		);
	if (!edgeProp) return null;

	const handle = graph.graphBindings.find(
		(graphBinding) => graphBinding.id === edgeProp.graphNodeId,
	);
	if (!handle || handle.kind !== 'element') return null;

	return { name: handle.name };
}

function conditionalClassTarget(
	attributeName: string,
	expressionValue: AnyNode | undefined,
): {
	readonly test: AnyNode;
	readonly target: SemanticTemplateBindingTarget;
} | null {
	if (attributeName !== 'class' || expressionValue?.type !== 'ConditionalExpression') {
		return null;
	}

	const test = expressionValue.test as AnyNode | undefined;
	const trueValue = stringLiteral(expressionValue.consequent as AnyNode | undefined);
	const falseValue = stringLiteral(expressionValue.alternate as AnyNode | undefined);
	if (!test || trueValue === null || falseValue === null) return null;

	return {
		test,
		target: {
			kind: 'class',
			trueValue,
			falseValue,
		},
	};
}

function stringLiteral(node: AnyNode | undefined): string | null {
	return node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null;
}

function sameHostStaticTextBranch(
	node: AnyNode | undefined,
	state: WalkState,
): {
	readonly hostNodeId: string;
	readonly tagName: string;
	readonly staticAttributesKey: string;
	readonly text: string;
} | null {
	const root = branchSingleOutput(node);
	if (!root || (root.type !== 'Element' && root.type !== 'JSXElement')) return null;

	const tagName = getElementTagName(root);
	if (!tagName || !isHostTagName(tagName)) return null;

	const hostNodeId = state.hostIds.get(root);
	const text = singleStaticTextChild(root);
	const staticAttributesKey = staticAttributeKey(root);
	if (!hostNodeId || text === null || staticAttributesKey === null) return null;

	return {
		hostNodeId,
		tagName,
		staticAttributesKey,
		text,
	};
}

function branchSingleOutput(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'BlockStatement') {
		const outputs = asNodes(node.body).filter((child) => !isIgnorableJsxTextNode(child));
		return outputs.length === 1 ? branchSingleOutput(outputs[0]) : null;
	}
	if (node.type === 'ExpressionStatement') {
		return branchSingleOutput(node.expression as AnyNode | undefined);
	}
	return node;
}

function singleStaticTextChild(node: AnyNode): string | null {
	const children = asNodes(node.children).filter((child) => !isIgnorableJsxTextNode(child));
	if (children.length !== 1) return null;
	const child = children[0]!;
	const text = trimmedStaticTextValue(child);
	return text === '' ? null : text;
}

// The whole value grammar for overlay: bare (true), {true}, {false}. Anything
// else - identifier, member access, call, template, non-boolean literal - is a
// null return, which the caller turns into MARKLESS_OVERLAY_VALUE_UNSUPPORTED.
function overlayLiteralValue(
	value: AnyNode | undefined,
	expression: AnyNode | undefined,
): boolean | null {
	if (!value) return true;
	const literal = expression ?? value;
	if (literal.type === 'Literal' && typeof literal.value === 'boolean') return literal.value;
	return null;
}

// No overlay case here on purpose: bare `overlay` already keys as
// ["overlay","true"] via the !value branch, and overlay={true} keys identically
// via the expression branch, so @if arm merging already treats the two spellings
// as the same arm shape. Skipping overlay would instead merge an elevated arm
// with a non-elevated one.
function staticAttributeKey(node: AnyNode): string | null {
	const attributes: Array<readonly [string, string]> = [];
	for (const attribute of getElementAttributes(node)) {
		const name = getIdentifierName(attribute.name as AnyNode | undefined);
		if (!name || isEventAttribute(name) || name === 'attach' || name === 'el') return null;

		const value = attribute.value as AnyNode | undefined;
		const expression = unwrapExpressionContainer(value);
		if (!value) {
			attributes.push([name, 'true']);
			continue;
		}
		if (value.type === 'Literal' && typeof value.value !== 'object') {
			attributes.push([name, String(value.value)]);
			continue;
		}
		if (expression?.type === 'Literal' && typeof expression.value !== 'object') {
			attributes.push([name, String(expression.value)]);
			continue;
		}
		return null;
	}
	return JSON.stringify(attributes);
}

function bindingTargetForAttribute(attributeName: string): SemanticTemplateBindingTarget {
	if (attributeName === 'class') return { kind: 'class' };
	if (attributeName === 'style') return { kind: 'style' };

	if (isDomPropertyBindingName(attributeName)) {
		return {
			kind: 'property',
			name: attributeName,
		};
	}

	return {
		kind: 'attribute',
		name: attributeName,
	};
}

function isDomPropertyBindingName(attributeName: string): boolean {
	return attributeName === 'value' || attributeName === 'checked' || attributeName === 'selected';
}

function resolveStaticObjectExpression(node: AnyNode, state: WalkState): AnyNode | null {
	if (node.type === 'ObjectExpression') return node;
	const name = getIdentifierName(node);
	if (!name) return null;
	let found: AnyNode | null = null;
	const ast = parseModule(state.source, state.filename) as unknown as AnyNode;
	walkNode(ast, (candidate) => {
		if (found || candidate.type !== 'VariableDeclarator') return;
		const id = candidate.id as AnyNode | undefined;
		const init = candidate.init as AnyNode | undefined;
		if (getIdentifierName(id) === name && init?.type === 'ObjectExpression') found = init;
	});
	return found;
}

function staticObjectKeys(node: AnyNode | null): string[] {
	if (!node || node.type !== 'ObjectExpression') return [];
	return asNodes(node.properties).flatMap((property) => {
		if (property.type !== 'Property') return [];
		const key = property.key as AnyNode | undefined;
		const name = getIdentifierName(key);
		if (name) return [name];
		if (key?.type === 'Literal' && typeof key.value === 'string') return [key.value];
		return [];
	});
}

function isSpreadEventKey(key: string): boolean {
	return /^on[A-Z]/.test(key) || key === 'attach' || key === 'el';
}

function isLowercaseEventAttributeName(attributeName: string): boolean {
	return /^on[a-z]/.test(attributeName);
}

function eventAttributeSuggestion(attributeName: string): string {
	return `on${attributeName.slice(2, 3).toUpperCase()}${attributeName.slice(3)}`;
}

function isFunctionExpressionLike(node: AnyNode): boolean {
	return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
}

function unextractableSyncPolicyDiagnostic(
	attributeName: string,
	value: AnyNode | undefined,
	handlers: ReadonlyArray<AnyNode>,
	state: Pick<WalkState, 'filename' | 'source'>,
): SemanticGraphDiagnostic {
	const detached = firstDetachedSyncPolicyReference({
		type: 'ArrayExpression',
		elements: handlers,
	} as AnyNode);
	if (detached) {
		const source = state.source.slice(detached.start, detached.end).trim();
		return {
			code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
			severity: 'error',
			phase: 'sync-policy',
			title: 'Cannot extract synchronous event policy',
			passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			message: `\`${source}\` detaches ${detached.action} from the event, so the compiler cannot prove when the default action is cancelled for ${attributeName}.`,
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load; a detached reference hides which action runs and under what condition.',
			primarySpan: { filename: state.filename, start: detached.start, end: detached.end },
			suggestions: [
				{
					message: `Call it directly on the event parameter instead of detaching ${detached.action}.`,
				},
			],
			docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		};
	}

	const actionCall =
		handlers.map((handler) => firstSyncPolicyActionCall(handler)).find(Boolean) ??
		firstSyncPolicyActionCall(value);
	const actionLabel = actionCall?.action ?? 'preventDefault/stopPropagation';

	return {
		code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		severity: 'error',
		phase: 'sync-policy',
		title: 'Cannot extract synchronous event policy',
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: `Cannot extract a synchronous ${actionLabel} policy for ${attributeName} because the guard is not limited to graph state, event fields, props, and constants.`,
		why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
		primarySpan:
			(actionCall ? sourceSpan(actionCall.node, state.filename) : undefined) ??
			(value ? sourceSpan(value, state.filename) : undefined) ??
			fallbackSpan(state.filename),
		suggestions: [
			{
				message:
					'Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.',
			},
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	};
}

function fallbackSpan(filename: string): SourceSpan {
	return { filename, start: 0, end: 0 };
}

type EventHandlerExpression = {
	readonly node: AnyNode;
	readonly source: string;
	readonly span?: SourceSpan;
};

function behaviorExpressions(node: AnyNode): AnyNode[] {
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}

function behaviorSourceParts(
	node: AnyNode,
	state: WalkState,
): Omit<SemanticBehavior, 'hostNodeId'> {
	const behaviorSource = expressionSource(node, state.source);

	if (node.type !== 'CallExpression') {
		return {
			source: behaviorSource,
			functionSource: localFunctionDeclarationSource(node, state) ?? behaviorSource,
			inputSources: [],
		};
	}

	const callee = node.callee as AnyNode | undefined;
	const calleeSource = callee ? expressionSource(callee, state.source) : behaviorSource;

	return {
		source: behaviorSource,
		functionSource: localFunctionDeclarationSource(callee, state) ?? calleeSource,
		inputSources: asNodes(node.arguments).map((argument) =>
			expressionSource(argument, state.source),
		),
	};
}

function localFunctionDeclarationSource(
	node: AnyNode | undefined,
	state: WalkState,
): string | null {
	const name = getIdentifierName(node);
	if (!name) return null;

	const declaration = state.helperFunctions.get(name);
	if (declaration) return expressionSource(declaration, state.source);

	return localFunctionValueSource(name, state)?.source ?? null;
}

function eventHandlerExpressions(
	node: AnyNode | undefined,
	state: WalkState,
): EventHandlerExpression[] {
	if (!node) return [];
	const expressions = node.type === 'ArrayExpression' ? asNodes(node.elements) : [node];

	return expressions.map((expression) => {
		const resolved = localFunctionValueSource(getIdentifierName(expression), state);
		if (!resolved) {
			return {
				node: expression,
				source: expressionSource(expression, state.source),
				span: sourceSpan(expression, state.filename),
			};
		}

		return { node: resolved.node, source: resolved.source, span: resolved.span };
	});
}

function handlerParameterNames(node: AnyNode): string[] {
	if (
		node.type !== 'ArrowFunctionExpression' &&
		node.type !== 'FunctionExpression' &&
		node.type !== 'FunctionDeclaration'
	) {
		return [];
	}

	return asNodes(node.params).flatMap((parameter) => {
		const name = getIdentifierName(parameter);
		return name ? [name] : [];
	});
}

function invalidEventHandlerExpression(
	attributeName: string,
	node: AnyNode | undefined,
	state: WalkState,
): SemanticGraphDiagnostic | null {
	const invalid = firstInvalidEventHandlerExpression(node);
	if (!invalid) return null;

	const source = expressionSource(invalid, state.source);
	return {
		code: 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'Event props need a function',
		primarySpan: sourceSpan(invalid, state.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: `\`${attributeName}={${source}}\` passes the result of \`${source}\`, not a function. The expression would run once while rendering, and the click would receive a number.`,
		why: 'An event prop compiles to a lazy handler symbol that runs on the browser event; only a function or an array of functions can be that handler.',
		suggestions: [
			{ message: `Wrap it in a function, for example ${attributeName}={() => ${source}}.` },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION',
	};
}

function firstInvalidEventHandlerExpression(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (node.type === 'ArrayExpression') {
		for (const item of asNodes(node.elements)) {
			const invalid = firstInvalidEventHandlerExpression(item);
			if (invalid) return invalid;
		}
		return null;
	}

	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	) {
		return null;
	}

	if (getIdentifierName(node)) return null;
	if (node.type === 'MemberExpression') return null;

	return node;
}

function localFunctionValueSource(
	name: string | null,
	state: WalkState,
): { readonly node: AnyNode; readonly source: string; readonly span?: SourceSpan } | null {
	if (!name) return null;
	const binding = state.graph.localBindings.find(
		(item) => item.name === name && item.kind === 'function',
	);
	if (!binding?.sourceSpan) return null;

	const node = localFunctionValueNode(name, binding.sourceSpan, state);
	if (!node) return null;

	return {
		node,
		source: expressionSource(node, state.source),
		span: sourceSpan(node, state.filename),
	};
}

function localFunctionValueNode(
	name: string,
	nameSpan: SourceSpan,
	state: WalkState,
): AnyNode | null {
	const ast = parseModule(state.source, state.filename) as unknown as AnyNode;
	let found: AnyNode | null = null;

	walkNode(ast, (node) => {
		if (found || node.type !== 'VariableDeclarator') return;
		const id = node.id as AnyNode | undefined;
		const init = node.init as AnyNode | undefined;
		if (
			getIdentifierName(id) === name &&
			id?.start === nameSpan.start &&
			(init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression')
		) {
			found = init;
		}
	});

	return found;
}
