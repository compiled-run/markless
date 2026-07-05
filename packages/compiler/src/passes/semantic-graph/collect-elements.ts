import { isEventAttribute, normalizeEventName, parseModule } from '@tsrx/core';
import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	getElementAttributes,
	getDynamicTagExpression,
	getElementTagName,
	isHostTagName,
	isIgnorableJsxTextNode,
	staticTextValue,
	trimmedStaticTextValue,
	unwrapExpressionContainer,
} from '../../ast/tsrx.ts';
import type {
	SemanticBehavior,
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticTemplateBindingTarget,
	SourceSpan,
} from '../../artifacts.ts';
import { graphBindingMap } from '../../artifact-helpers/graph-paths.ts';
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
	duplicateElementHandleDiagnostic,
	elementHandleRequiredDiagnostic,
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
		state.graph.hostNodes.push({ id: hostNodeId, tagName: tagName ?? '*' });
		state.currentHostNodeId = hostNodeId;
	}

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

	state.graph.templateReads.push({
		hostNodeId: state.currentHostNodeId,
		source: expressionSource(expression, state.source),
		sourceSpan: sourceSpan(expression, state.filename),
		target: state.currentTextTarget ?? { kind: 'text' },
		asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
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
		});
	}
}

export function collectElementHandleDiagnostics(graph: MutableSemanticGraphArtifact): void {
	const bindings = graphBindingMap(graph);
	const validElementHandleBindings: SemanticElementHandleBinding[] = [];

	for (const binding of graph.elementHandleBindings) {
		const graphBinding = bindings.get(binding.handleName);
		if (!graphBinding || graphBinding.kind !== 'element') {
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
}

function collectAttribute(
	attribute: AnyNode,
	state: WalkState,
	walk: SemanticGraphWalk,
	hostNodeId: string | null,
	ownerTagName: string | null,
	isHostElement: boolean,
): void {
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
				sourceSpan: sourceSpan(expressionValue, state.filename),
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

function unextractableSyncPolicyDiagnostic(attributeName: string, value: AnyNode | undefined, handlers: ReadonlyArray<AnyNode>, state: Pick<WalkState, 'filename' | 'source'>): SemanticGraphDiagnostic {
	const detached = firstDetachedSyncPolicyReference({
		type: 'ArrayExpression',
		elements: handlers,
	} as AnyNode);
	if (detached) {
		const source = state.source.slice(detached.start, detached.end).trim();
		return {
			code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE', severity: 'error', phase: 'sync-policy',
			title: 'Cannot extract synchronous event policy', passId: 'tsrx-semantic-graph',
			artifactKeys: ['semanticGraph'],
			message: `\`${source}\` detaches ${detached.action} from the event, so the compiler cannot prove when the default action is cancelled for ${attributeName}.`,
			why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load; a detached reference hides which action runs and under what condition.',
			primarySpan: { filename: state.filename, start: detached.start, end: detached.end },
			suggestions: [{ message: `Call it directly on the event parameter instead of detaching ${detached.action}.` }],
			docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
		};
	}

	const actionCall =
		handlers.map((handler) => firstSyncPolicyActionCall(handler)).find(Boolean) ??
		firstSyncPolicyActionCall(value);
	const actionLabel = actionCall?.action ?? 'preventDefault/stopPropagation';

	return {
		code: 'MARKLESS_SYNC_POLICY_UNEXTRACTABLE', severity: 'error', phase: 'sync-policy',
		title: 'Cannot extract synchronous event policy', passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		message: `Cannot extract a synchronous ${actionLabel} policy for ${attributeName} because the guard is not limited to graph state, event fields, props, and constants.`,
		why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
		primarySpan:
			(actionCall ? sourceSpan(actionCall.node, state.filename) : undefined) ??
			(value ? sourceSpan(value, state.filename) : undefined) ??
			fallbackSpan(state.filename),
		suggestions: [{ message: 'Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.' }],
		docsUrl: 'https://markless.dev/errors/MARKLESS_SYNC_POLICY_UNEXTRACTABLE',
	};
}

function fallbackSpan(filename: string): SourceSpan {
	return { filename, start: 0, end: 0 };
}

type EventHandlerExpression = { readonly node: AnyNode; readonly source: string; readonly span?: SourceSpan };

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

function localFunctionDeclarationSource(node: AnyNode | undefined, state: WalkState): string | null {
	const name = getIdentifierName(node);
	if (!name) return null;

	const declaration = state.helperFunctions.get(name);
	if (declaration) return expressionSource(declaration, state.source);

	return localFunctionValueSource(name, state)?.source ?? null;
}

function eventHandlerExpressions(node: AnyNode | undefined, state: WalkState): EventHandlerExpression[] {
	if (!node) return [];
	const expressions = node.type === 'ArrayExpression' ? asNodes(node.elements) : [node];

	return expressions.map((expression) => {
		const resolved = localFunctionValueSource(getIdentifierName(expression), state);
		if (!resolved) {
			return { node: expression, source: expressionSource(expression, state.source), span: sourceSpan(expression, state.filename) };
		}

		return { node: resolved.node, source: resolved.source, span: resolved.span };
	});
}

function handlerParameterNames(node: AnyNode): string[] {
	if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression' && node.type !== 'FunctionDeclaration') {
		return [];
	}

	return asNodes(node.params).flatMap((parameter) => {
		const name = getIdentifierName(parameter);
		return name ? [name] : [];
	});
}

function invalidEventHandlerExpression(attributeName: string, node: AnyNode | undefined, state: WalkState): SemanticGraphDiagnostic | null {
	const invalid = firstInvalidEventHandlerExpression(node);
	if (!invalid) return null;

	const source = expressionSource(invalid, state.source);
	return {
		code: 'MARKLESS_EVENT_HANDLER_NOT_A_FUNCTION', severity: 'error',
		phase: 'semantic-graph', title: 'Event props need a function',
		primarySpan: sourceSpan(invalid, state.filename),
		passId: 'tsrx-semantic-graph', artifactKeys: ['semanticGraph'],
		message: `\`${attributeName}={${source}}\` passes the result of \`${source}\`, not a function. The expression would run once while rendering, and the click would receive a number.`,
		why: 'An event prop compiles to a lazy handler symbol that runs on the browser event; only a function or an array of functions can be that handler.',
		suggestions: [{ message: `Wrap it in a function, for example ${attributeName}={() => ${source}}.` }],
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

	if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') {
		return null;
	}

	if (getIdentifierName(node)) return null;
	if (node.type === 'MemberExpression') return null;

	return node;
}

function localFunctionValueSource(name: string | null, state: WalkState): { readonly node: AnyNode; readonly source: string; readonly span?: SourceSpan } | null {
	if (!name) return null;
	const binding = state.graph.localBindings.find(
		(item) => item.name === name && item.kind === 'function',
	);
	if (!binding?.sourceSpan) return null;

	const node = localFunctionValueNode(name, binding.sourceSpan, state);
	if (!node) return null;

	return { node, source: expressionSource(node, state.source), span: sourceSpan(node, state.filename) };
}

function localFunctionValueNode(name: string, nameSpan: SourceSpan, state: WalkState): AnyNode | null {
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
