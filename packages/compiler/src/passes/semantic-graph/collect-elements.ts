import { isEventAttribute, normalizeEventName } from 'yuku-tsrx';
import { parseModule } from '../../js-ast.ts';
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
	SemanticComponentPropBinding,
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticGraphBinding,
	SemanticTemplateBindingTarget,
	SourceSpan,
} from '../../artifacts.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectComponentEdge } from './collect-components.ts';
import {
	collectCompositeTemplateExpression,
	type CompositeReadOptions,
	joinReadSources,
	mintTemplateExpressionComputed,
	pureCompositeReadSources,
} from './composite-reads.ts';
import { collectExpressionReads, resolvedSymbolAt } from './collect-expressions.ts';
import {
	extractSyncPolicy,
	firstDetachedSyncPolicyReference,
	firstSyncPolicyActionCall,
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
	compositeIdrefElementHandleDiagnostic,
	rowOwnedIdrefElementHandleDiagnostic,
	widgetRootIdrefElementHandleDiagnostic,
	unboundIdrefElementHandleDiagnostic,
	anchorElementHandleValueDiagnostic,
	anchorElementHandleHostRequiredDiagnostic,
	unboundAnchorElementHandleDiagnostic,
	rowOwnedAnchorElementHandleDiagnostic,
	widgetRootAnchorElementHandleDiagnostic,
} from './diagnostics.ts';
import { anchorStyleProperty, isIdrefAttribute } from './idref-attributes.ts';
import { resolveSharedInstanceGraphPath } from './collect-shared.ts';
import {
	createStyleConstResolver,
	lowerStyleObject,
	type StyleConstResolver,
	type StyleObjectLowering,
} from './style-object.ts';
import type {
	MutableSemanticGraphArtifact,
	PendingElementHandleAnchor,
	PendingElementHandleIdref,
	SemanticGraphWalk,
	WalkState,
} from './types.ts';

/**
 * What every template position - attribute value, conditional class test, text -
 * counts as part of a read.
 *
 * `unaryOperators` is on: `ui-tall={!board.wide}` rendered once and never moved,
 * because the gate listed conditionals, binaries, logicals and template literals
 * and left the unary out, so the read resolved to no graph node and the update
 * record was dropped. The reads under the operator are already decomposed exactly
 * as `board.wide === false` decomposes them.
 *
 * `methodCalls` stays off: nothing in a template is unexpressible without it, and
 * a computed minted for every `.format()` and `.toFixed()` in a page's text is
 * bytes with no behavior behind them. Widening it is its own change with its own
 * byte measurement.
 */
const TEMPLATE_READ_OPTIONS: CompositeReadOptions = { unaryOperators: true };

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
	const composite = collectCompositeTemplateExpression(expression, state, TEMPLATE_READ_OPTIONS);

	state.graph.templateReads.push({
		hostNodeId: state.currentHostNodeId,
		source: expressionSource(expression, state.source),
		sourceSpan: sourceSpan(expression, state.filename),
		target: state.currentTextTarget ?? { kind: 'text' },
		asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
		computedGraphNodeId: composite?.graphNodeId,
		componentName: state.currentComponentName ?? undefined,
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
			componentName: state.currentComponentName ?? undefined,
		});
	}
}

export function collectElementHandleDiagnostics(
	graph: MutableSemanticGraphArtifact,
	pendingIdrefs: ReadonlyArray<PendingElementHandleIdref> = [],
	pendingAnchors: ReadonlyArray<PendingElementHandleAnchor> = [],
): void {
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
		// `el={checkbox.triggerEl}` names a handle the shared factory declared. The
		// component-scope lookup answers first with the factory's state cell (the
		// instance local shares its name), so the shared route wins whenever it is
		// the one that lands on an element node.
		const resolved =
			elementHandlePath(
				resolveSharedInstanceGraphPath(binding.handleName, graph, binding.componentName),
			) ??
			resolveGraphPath(binding.handleName, bindings, aliases);
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
		// A handle reached through a shared instance is keyed by the factory's own
		// name, so every component of the family names one relationship.
		validElementHandleBindings.push(
			binding.handleName === graphBinding.name
				? binding
				: { ...binding, handleName: graphBinding.name },
		);
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

	resolveElementHandleIdrefs(graph, pendingIdrefs, firstBindingByHandle);
	resolveElementHandleAnchors(graph, pendingAnchors, firstBindingByHandle);
}

/**
 * Turns the walk's pending IDREF references into records, now that every
 * `el={handle}` binding in the file is known. A reference whose handle was never
 * bound never becomes a record: it becomes an error, because an IDREF pointing
 * at nothing is invisible at runtime.
 */
function resolveElementHandleIdrefs(
	graph: MutableSemanticGraphArtifact,
	pendingIdrefs: ReadonlyArray<PendingElementHandleIdref>,
	boundByHandle: ReadonlyMap<string, SemanticElementHandleBinding>,
): void {
	for (const reference of pendingIdrefs) {
		const bound = boundByHandle.get(reference.handleName);
		if (!bound) {
			graph.diagnostics.push(unboundIdrefElementHandleDiagnostic(reference));
			continue;
		}
		if (bound.rowOwner || bound.keyedRepeatScopeIds.length > 0) {
			graph.diagnostics.push(rowOwnedIdrefElementHandleDiagnostic(reference));
			continue;
		}
		const handleBinding = graph.graphBindings.find(
			(binding) => binding.kind === 'element' && binding.name === bound.handleName,
		);
		if (!handleBinding) {
			graph.diagnostics.push(unboundIdrefElementHandleDiagnostic(reference));
			continue;
		}
		if (handleBinding.sharedDefinitionId !== undefined) {
			// A widget's own root resolves the factory before any part of it
			// renders, so the token naming the widget instance is not readable
			// from inside the root itself; only the parts it seeds carry it.
			const widgetRoot = widgetRootComponentName(graph, handleBinding.sharedDefinitionId);
			if (
				widgetRoot === undefined ||
				widgetRoot === reference.componentName ||
				widgetRoot === bound.componentName
			) {
				graph.diagnostics.push(widgetRootIdrefElementHandleDiagnostic(reference));
				continue;
			}
		}
		graph.elementHandleIdrefs.push({
			...reference,
			handleGraphNodeId: handleBinding.id,
			boundHostNodeId: bound.hostNodeId,
			order: graph.elementHandleIdrefs.length,
		});
	}
}

/**
 * The same resolution the IDREF pass runs, for the CSS anchor positions.
 *
 * Every gate is the same gate and for the same reason - an anchor name that
 * resolves to no rendered instance is as silently broken as an IDREF that
 * resolves to no element - with one difference: an anchor record does NOT put a
 * minted id on the element the handle is bound to. CSS reads the dashed-ident
 * name off that element's own inline style, so the id would be bytes nothing
 * reads. That is why the two records stay apart.
 */
function resolveElementHandleAnchors(
	graph: MutableSemanticGraphArtifact,
	pendingAnchors: ReadonlyArray<PendingElementHandleAnchor>,
	boundByHandle: ReadonlyMap<string, SemanticElementHandleBinding>,
): void {
	for (const reference of pendingAnchors) {
		const bound = boundByHandle.get(reference.handleName);
		if (!bound) {
			graph.diagnostics.push(unboundAnchorElementHandleDiagnostic(reference));
			continue;
		}
		if (bound.rowOwner || bound.keyedRepeatScopeIds.length > 0) {
			graph.diagnostics.push(rowOwnedAnchorElementHandleDiagnostic(reference));
			continue;
		}
		const handleBinding = graph.graphBindings.find(
			(binding) => binding.kind === 'element' && binding.name === bound.handleName,
		);
		if (!handleBinding) {
			graph.diagnostics.push(unboundAnchorElementHandleDiagnostic(reference));
			continue;
		}
		if (handleBinding.sharedDefinitionId !== undefined) {
			const widgetRoot = widgetRootComponentName(graph, handleBinding.sharedDefinitionId);
			if (
				widgetRoot === undefined ||
				widgetRoot === reference.componentName ||
				widgetRoot === bound.componentName
			) {
				graph.diagnostics.push(widgetRootAnchorElementHandleDiagnostic(reference));
				continue;
			}
		}
		graph.elementHandleAnchors.push({
			...reference,
			handleGraphNodeId: handleBinding.id,
			order: graph.elementHandleAnchors.length,
		});
	}
}

/**
 * The component that resolves a widget-scoped factory first owns its nodes, so
 * its rendered instance is the widget root every other part is seeded from.
 */
function widgetRootComponentName(
	graph: MutableSemanticGraphArtifact,
	sharedDefinitionId: string,
): string | undefined {
	const definition = graph.sharedDefinitions.find(
		(candidate) => candidate.id === sharedDefinitionId,
	);
	if (definition?.scope !== 'widget') return undefined;
	return graph.sharedInstances.find(
		(instance) => instance.definitionId === sharedDefinitionId && instance.componentName,
	)?.componentName;
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

	// A component/part tag has no host node of its own, so nothing below this
	// point applies - but an IDREF handle written there is still this component's
	// record: the element that must carry the minted id is rendered HERE, and the
	// id crosses the edge as a value the child spreads onto its own markup.
	if (!hostNodeId) {
		// An anchor position lowers to an inline style on an element THIS markup
		// renders, and a component tag renders none, so it cannot cross the edge
		// the way a minted id can.
		if (anchorStyleProperty(attributeName)) {
			state.graph.diagnostics.push(
				anchorElementHandleHostRequiredDiagnostic({
					attributeName,
					ownerTagName,
					span: sourceSpan(attribute, state.filename),
				}),
			);
			if (expressionValue) walk(expressionValue, state);
			return;
		}
		collectIdrefAttribute(attributeName, expressionValue, state, walk, null);
		return;
	}

	if (isEventAttribute(attributeName)) {
		if (expressionValue?.type === 'ArrayExpression') {
			state.graph.diagnostics.push(
				eventHandlerArrayDiagnostic(attributeName, expressionValue, state),
			);
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
			return;
		}

		const invalidHandler = invalidEventHandlerExpression(attributeName, expressionValue, state);
		if (invalidHandler) {
			state.graph.diagnostics.push(invalidHandler);
			collectExpressionReads(expressionValue, state);
			walk(expressionValue, state);
			return;
		}

		const handler = eventHandlerExpression(expressionValue, state);
		const syncPolicy = extractSyncPolicy(handler?.node, state);
		const hasSyncPolicyCandidate = handler
			? hasSyncEventPolicyCandidate(handler.node) ||
				Boolean(firstDetachedSyncPolicyReference(handler.node))
			: false;
		if (hasSyncPolicyCandidate && !syncPolicy) {
			state.graph.diagnostics.push(
				unextractableSyncPolicyDiagnostic(
					attributeName,
					value,
					handler ? [handler.node] : [],
					state,
				),
			);
		}
		state.graph.events.push({
			id: `event:${state.nextEventId++}`,
			hostNodeId,
			eventName: normalizeEventName(attributeName),
			...(handler ? { handlerSource: handler.source, handlerSpan: handler.span } : {}),
			handlerParameters: handler ? handlerParameterNames(handler.node) : [],
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

	// Must sit above the generic attribute branch, or the handle falls through to
	// an ordinary value binding.
	if (collectIdrefAttribute(attributeName, expressionValue, state, walk, hostNodeId)) return;
	if (collectAnchorAttribute(attribute, attributeName, expressionValue, state, walk, hostNodeId))
		return;

	const conditionalClass = conditionalClassTarget(attributeName, expressionValue);
	if (conditionalClass) {
		// A test that is not a plain graph read resolves to no graph node later, so
		// without this computed the whole record is dropped and the class never moves.
		const composite = collectCompositeTemplateExpression(
			conditionalClass.test,
			state,
			TEMPLATE_READ_OPTIONS,
		);
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(conditionalClass.test, state.source),
			sourceSpan: sourceSpan(conditionalClass.test, state.filename),
			target: conditionalClass.target,
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
			computedGraphNodeId: composite?.graphNodeId,
			componentName: state.currentComponentName ?? undefined,
		});
		walk(expressionValue, state);
		return;
	}

	if (attributeName === 'style' && expressionValue?.type === 'ObjectExpression') {
		collectStyleObjectAttribute(expressionValue, expressionValue, state, walk, hostNodeId);
		return;
	}

	// style={identifier}: a same-file const object literal is substituted and
	// lowered exactly as if written inline. A named refusal fails closed here; an
	// unclaimed identifier (graph binding, string const, unknown) falls through
	// to the existing attribute handling below.
	if (attributeName === 'style' && expressionValue?.type === 'Identifier') {
		const name = getIdentifierName(expressionValue);
		const resolved = name
			? styleConstResolver(state).resolveObject(name, expressionValue.start ?? 0)
			: null;
		if (resolved?.object) {
			collectStyleObjectAttribute(resolved.object, expressionValue, state, walk, hostNodeId);
			return;
		}
		if (resolved?.reason !== undefined) {
			state.graph.diagnostics.push(
				styleObjectUnsupportedDiagnostic({
					valueSource: expressionSource(expressionValue, state.source),
					reason: resolved.reason,
					node: expressionValue,
					filename: state.filename,
				}),
			);
			walk(expressionValue, state);
			return;
		}
	}

	if (expressionValue && expressionValue.type !== 'Literal') {
		const attributeDiagnostic = attributeValueDiagnostic(attributeName, expressionValue, state);
		if (attributeDiagnostic) state.graph.diagnostics.push(attributeDiagnostic);
		// A refused style object owes no update record: writing one would bind the
		// object itself into the attribute, which is the "[object Object]" the
		// diagnostic exists to stop.
		if (attributeDiagnostic?.code === 'MARKLESS_STYLE_OBJECT_UNSUPPORTED') {
			walk(expressionValue, state);
			return;
		}
		// A recombined value resolves to no graph node, so without this nothing subscribes it.
		const composite = collectCompositeTemplateExpression(expressionValue, state, {
			...TEMPLATE_READ_OPTIONS,
			requireWritableRead: true,
		});
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(expressionValue, state.source),
			sourceSpan: sourceSpan(expressionValue, state.filename),
			target: bindingTargetForAttribute(attributeName),
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
			computedGraphNodeId: composite?.graphNodeId,
			componentName: state.currentComponentName ?? undefined,
		});
		walk(expressionValue, state);
	}
}

/**
 * Lowers `style={{ ... }}`. A literal-only object leaves no record at all - the
 * markup pass writes its CSS text straight into the template - while an object
 * with reactive values becomes one recombined CSS-text expression behind a
 * single synthetic computed, so the server text and the live update are the
 * same expression.
 */
function collectStyleObjectAttribute(
	objectNode: AnyNode,
	usageNode: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string,
): void {
	const lowering = lowerStyleObject(objectNode, state.source, {
		resolver: styleConstResolver(state),
		usagePos: usageNode.start ?? 0,
		referenced: objectNode !== usageNode,
	});
	if (lowering?.kind === 'static') return;

	const composite = lowering?.kind === 'dynamic' ? mintStyleObjectComputed(lowering, state) : null;
	if (lowering?.kind === 'dynamic' && composite) {
		state.graph.templateReads.push({
			hostNodeId,
			source: expressionSource(usageNode, state.source),
			sourceSpan: sourceSpan(usageNode, state.filename),
			target: bindingTargetForAttribute('style'),
			asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
			computedGraphNodeId: composite.graphNodeId,
			componentName: state.currentComponentName ?? undefined,
		});
		walk(usageNode, state);
		return;
	}

	state.graph.diagnostics.push(
		styleObjectUnsupportedDiagnostic({
			valueSource: expressionSource(usageNode, state.source),
			reason:
				lowering?.kind === 'unsupported'
					? lowering.reason
					: 'a value that is not a plain read of state, a computed value, or a prop',
			node: usageNode,
			filename: state.filename,
		}),
	);
	walk(usageNode, state);
}

function styleConstResolver(state: WalkState): StyleConstResolver {
	state.styleConstResolver ??= createStyleConstResolver(state.source, state.filename);
	return state.styleConstResolver;
}

function mintStyleObjectComputed(
	lowering: Extract<StyleObjectLowering, { readonly kind: 'dynamic' }>,
	state: WalkState,
): { readonly graphNodeId: string } | null {
	const readSources = joinReadSources(
		lowering.valueExpressions.map((value) => pureCompositeReadSources(value, state)),
	);
	if (!readSources || readSources.length === 0) return null;

	return mintTemplateExpressionComputed(
		`() => ${lowering.expressionSource}`,
		readSources,
		state,
	);
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
			reason:
				expressionValue.type === 'ArrayExpression' || resolved?.binding.valueKind === 'array'
					? 'an array of styles'
					: 'a whole object held in state and passed as the style value — the object lives in the graph at runtime, so the compiler cannot freeze it into CSS text',
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
			(prop): prop is Extract<SemanticComponentPropBinding, { kind: 'graph-reference' }> =>
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

type IdrefValueClassification =
	| { readonly kind: 'handle'; readonly handleName: string }
	| { readonly kind: 'composite' };

/**
 * Classifies an IDREF attribute value. `handle` is one element() handle written
 * directly, the only form this slice records. `composite` is any expression that
 * mentions a handle without being one - a list, a join, a choice - which is
 * refused rather than lowered. `null` is everything else, including an ordinary
 * id string, which keeps its existing templateRead.
 */
/**
 * An element() handle in an IDREF position is identity, not a value. Left to
 * fall through it becomes an ordinary binding that writes a DOM element into a
 * string attribute - the page renders, the relationship does not exist, and
 * nothing says so. Non-handle values in these same attributes are untouched.
 *
 * `hostNodeId` is null when the attribute sits on a component/part tag, which
 * changes only who writes the attribute, not who owns the record. Returns
 * whether this attribute was claimed.
 */
function collectIdrefAttribute(
	attributeName: string,
	expressionValue: AnyNode | undefined,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string | null,
): boolean {
	if (!expressionValue || !isIdrefAttribute(attributeName)) return false;
	const classified = classifyIdrefValue(expressionValue, state);
	if (classified?.kind === 'composite') {
		state.graph.diagnostics.push(
			compositeIdrefElementHandleDiagnostic({
				attributeName,
				source: expressionSource(expressionValue, state.source),
				span: sourceSpan(expressionValue, state.filename),
			}),
		);
		walk(expressionValue, state);
		return true;
	}
	if (classified?.kind !== 'handle') return false;
	// No templateRead and no boundHostNodeId yet: whether this handle is ever
	// bound is not knowable until the whole file has been walked.
	state.pendingElementHandleIdrefs.push({
		hostNodeId,
		attributeName,
		handleName: classified.handleName,
		source: expressionSource(expressionValue, state.source),
		componentName: state.currentComponentName ?? undefined,
		sourceSpan: sourceSpan(expressionValue, state.filename),
		...(state.currentKeyedRepeatScopeIds.length > 0
			? { keyedRepeatScopeIds: [...state.currentKeyedRepeatScopeIds] }
			: {}),
		...(state.currentAsyncBoundaryId ? { asyncBoundaryId: state.currentAsyncBoundaryId } : {}),
	});
	return true;
}

/**
 * `anchorName={handle}` / `positionAnchor={handle}` on a host element.
 *
 * Unlike an IDREF attribute, these names are not DOM attributes at all, so a
 * non-handle value cannot be left to fall through: `anchorName="mine"` would be
 * written into the HTML as `anchorname="mine"`, which no browser reads and
 * nothing else would report. Every value that is not one element() handle
 * written directly is refused here. Returns whether this attribute was claimed.
 */
function collectAnchorAttribute(
	attribute: AnyNode,
	attributeName: string,
	expressionValue: AnyNode | undefined,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string,
): boolean {
	if (!anchorStyleProperty(attributeName)) return false;
	const handleName = expressionValue
		? resolvedElementHandleName(expressionValue, state)
		: undefined;
	if (!handleName) {
		state.graph.diagnostics.push(
			anchorElementHandleValueDiagnostic({
				attributeName,
				source: expressionValue
					? expressionSource(expressionValue, state.source)
					: 'no value',
				span: sourceSpan(expressionValue ?? attribute, state.filename),
			}),
		);
		if (expressionValue) walk(expressionValue, state);
		return true;
	}
	// Whether the handle is ever bound is not knowable until the whole file has
	// been walked, so this is a pending record exactly like an IDREF's.
	state.pendingElementHandleAnchors.push({
		hostNodeId,
		attributeName,
		handleName,
		source: expressionSource(expressionValue!, state.source),
		componentName: state.currentComponentName ?? undefined,
		sourceSpan: sourceSpan(expressionValue!, state.filename),
	});
	return true;
}

function classifyIdrefValue(
	expression: AnyNode,
	state: WalkState,
): IdrefValueClassification | null {
	const handleName = resolvedElementHandleName(expression, state);
	if (handleName) return { kind: 'handle', handleName };
	return mentionsElementHandle(expression, state) ? { kind: 'composite' } : null;
}

// A resolution is an element() handle only when it lands on an element node
// with nothing left of the path; anything else is a value read.
function elementHandlePath(
	resolved: ReturnType<typeof resolveGraphPath>,
): ReturnType<typeof resolveGraphPath> {
	if (!resolved || resolved.binding.kind !== 'element' || resolved.path.length > 0) return null;
	return resolved;
}

function resolvedElementHandleName(expression: AnyNode, state: WalkState): string | null {
	const source = expressionSource(expression, state.source);
	if (!source) return null;
	// `checkbox.triggerEl` names a handle the shared factory declared; the same
	// two-route lookup the el= path uses, so one form does not silently become a
	// value read while the other records a relationship.
	const resolved =
		elementHandlePath(
			resolveSharedInstanceGraphPath(source, state.graph, state.currentComponentName),
		) ??
		// A member path such as `label.id` is a render-time DOM read, not identity;
		// it keeps falling through to MARKLESS_ELEMENT_HANDLE_RENDER_READ.
		elementHandlePath(
			resolveGraphPath(source, graphBindingMap(state.graph), semanticAliasMap(state.graph)),
		);
	if (!resolved) return null;
	return resolved.binding.name;
}

function mentionsElementHandle(expression: AnyNode, state: WalkState): boolean {
	let found = false;
	walkNode(expression, (node) => {
		if (found || node.type !== 'Identifier') return;
		if (resolvedElementHandleName(node, state)) found = true;
	});
	return found;
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

/**
 * Source offset of the declaration an identifier use actually refers to.
 *
 * The question is asked of yuku's resolved references rather than of a name,
 * because two components can each declare `attrs`, and a nested block can
 * shadow one written above it. A search for the first declarator carrying the
 * name answers with whichever one the file happens to write first, which is the
 * right answer only by luck.
 */
function resolvedDeclarationStart(node: AnyNode | undefined, state: WalkState): number | null {
	if (!node || typeof node.start !== 'number' || !getIdentifierName(node)) return null;

	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, node.start);
	if (symbolId === null || semantic.symbol.declCount(symbolId) === 0) return null;

	const declaration = semantic.symbol.declNode(symbolId, 0);
	return typeof declaration.start === 'number' ? declaration.start : null;
}

function resolveStaticObjectExpression(node: AnyNode, state: WalkState): AnyNode | null {
	if (node.type === 'ObjectExpression') return node;
	const declarationStart = resolvedDeclarationStart(node, state);
	if (declarationStart === null) return null;
	let found: AnyNode | null = null;
	const ast = parseModule(state.source, state.filename) as unknown as AnyNode;
	walkNode(ast, (candidate) => {
		if (found || candidate.type !== 'VariableDeclarator') return;
		const id = candidate.id as AnyNode | undefined;
		const init = candidate.init as AnyNode | undefined;
		if (id?.start === declarationStart && init?.type === 'ObjectExpression') found = init;
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

	return localFunctionValueSource(node, state)?.source ?? null;
}

function eventHandlerExpression(
	node: AnyNode | undefined,
	state: WalkState,
): EventHandlerExpression | null {
	if (!node) return null;

	const resolved = localFunctionValueSource(node, state);
	if (!resolved) {
		return {
			node,
			source: expressionSource(node, state.source),
			span: sourceSpan(node, state.filename),
		};
	}

	return { node: resolved.node, source: resolved.source, span: resolved.span };
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

function eventHandlerArrayDiagnostic(
	attributeName: string,
	node: AnyNode,
	state: WalkState,
): SemanticGraphDiagnostic {
	const calls = asNodes(node.elements).map((element) => {
		const name = getIdentifierName(element);
		return name ? `${name}(event)` : '/* ... */';
	});
	const body = calls.length > 0 ? calls.join('; ') : '/* ... */';

	return {
		code: 'MARKLESS_EVENT_HANDLER_ARRAY_UNSUPPORTED',
		severity: 'error',
		phase: 'semantic-graph',
		title: 'One handler per event attribute',
		primarySpan: sourceSpan(node, state.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: `\`${attributeName}\` takes one handler, not a list. Compose the calls yourself in a single function.`,
		why: 'An event attribute compiles to one lazy handler symbol. A closure you write keeps the call order, early returns, and conditions visible in your own code instead of hiding them in a framework rule.',
		suggestions: [
			{ message: `Write one function that calls both: ${attributeName}={(event) => { ${body} }}.` },
			{ message: 'The list-shaped attribute is `attach`, which still takes an array.' },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_ARRAY_UNSUPPORTED',
	};
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
		why: 'An event prop compiles to a lazy handler symbol that runs on the browser event; only a function can be that handler.',
		suggestions: [
			{ message: `Wrap it in a function, for example ${attributeName}={() => ${source}}.` },
		],
		docsUrl: 'https://markless.dev/errors/MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION',
	};
}

function firstInvalidEventHandlerExpression(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;

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

/**
 * The function value a handler identifier names, when it names a local one.
 *
 * The local binding is looked up by the declaration site the reference resolves
 * to, not by name: `onClick={handler}` in one component must not pick up the
 * `handler` another component declares above it.
 */
function localFunctionValueSource(
	node: AnyNode | undefined,
	state: WalkState,
): { readonly node: AnyNode; readonly source: string; readonly span?: SourceSpan } | null {
	const declarationStart = resolvedDeclarationStart(node, state);
	if (declarationStart === null) return null;
	const binding = state.graph.localBindings.find(
		(item) => item.sourceSpan?.start === declarationStart && item.kind === 'function',
	);
	if (!binding) return null;

	const valueNode = localFunctionValueNode(declarationStart, state);
	if (!valueNode) return null;

	return {
		node: valueNode,
		source: expressionSource(valueNode, state.source),
		span: sourceSpan(valueNode, state.filename),
	};
}

function localFunctionValueNode(declarationStart: number, state: WalkState): AnyNode | null {
	const ast = parseModule(state.source, state.filename) as unknown as AnyNode;
	let found: AnyNode | null = null;

	walkNode(ast, (node) => {
		if (found || node.type !== 'VariableDeclarator') return;
		const id = node.id as AnyNode | undefined;
		const init = node.init as AnyNode | undefined;
		if (
			id?.start === declarationStart &&
			(init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression')
		) {
			found = init;
		}
	});

	return found;
}
