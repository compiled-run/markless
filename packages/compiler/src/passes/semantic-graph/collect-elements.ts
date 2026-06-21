import { isEventAttribute, normalizeEventName } from '@tsrx/core';
import { asNodes, getIdentifierName, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type {
	SemanticBehavior,
	SemanticElementHandleBinding,
	SemanticGraphDiagnostic,
	SemanticTemplateBindingTarget,
	SourceSpan,
} from '../../artifacts.ts';
import { graphBindingMap } from '../../artifact-helpers/graph-paths.ts';
import { collectExpressionReads } from './collect-expressions.ts';
import {
	extractSyncPolicy,
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
	const tagName = getElementTagName(node);
	const previousHost = state.currentHostNodeId;
	const isHostElement = tagName ? isHostTagName(tagName) : false;
	let hostNodeId = previousHost;

	if (tagName && isHostElement) {
		hostNodeId = `h${state.nextHostId++}`;
		state.hostIds.set(node, hostNodeId);
		state.graph.hostNodes.push({ id: hostNodeId, tagName });
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

	for (const child of asNodes(node.children)) {
		walk(child, state);
	}

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
		target: {
			kind: 'text',
		},
		asyncBoundaryId: state.currentAsyncBoundaryId ?? undefined,
	});
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
		const handlers = eventHandlerExpressions(expressionValue);
		const handlerSources = handlers.map((handler) => expressionSource(handler, state.source));
		const handlerSpans = handlers.map((handler) => sourceSpan(handler, state.filename));
		const handlerParameters = handlers.map(handlerParameterNames);
		const syncPolicy = extractSyncPolicy(expressionValue, state);
		const hasSyncPolicyCandidate = hasSyncEventPolicyCandidate(expressionValue);
		if (hasSyncPolicyCandidate && !syncPolicy) {
			state.graph.diagnostics.push(
				unextractableSyncPolicyDiagnostic(attributeName, value, state),
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
					...behaviorSourceParts(behavior, state.source),
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

function unextractableSyncPolicyDiagnostic(
	attributeName: string,
	value: AnyNode | undefined,
	state: Pick<WalkState, 'filename'>,
): SemanticGraphDiagnostic {
	const actionCall = firstSyncPolicyActionCall(value);
	const actionLabel = actionCall?.action ?? 'preventDefault/stopPropagation';

	return {
		code: 'ARCADE_SYNC_POLICY_UNEXTRACTABLE',
		severity: 'error',
		phase: 'sync-policy',
		title: 'Cannot extract synchronous event policy',
		message: `Cannot extract a synchronous ${actionLabel} policy for ${attributeName} because the guard is not limited to graph state, event fields, props, and constants.`,
		why: 'preventDefault() and stopPropagation() must run before lazy handler symbols load. The compiler can only emit a synchronous policy when the condition is fully represented in the resumable graph/event data plane.',
		primarySpan:
			(actionCall ? sourceSpan(actionCall.node, state.filename) : undefined) ??
			(value ? sourceSpan(value, state.filename) : undefined) ??
			fallbackSpan(state.filename),
		passId: 'tsrx-semantic-graph',
		artifactKeys: ['semanticGraph'],
		suggestions: [
			{
				message:
					'Move the browser-critical condition into graph state and simple event-field comparisons, or remove preventDefault()/stopPropagation() from the lazy handler.',
			},
		],
		docsUrl: 'https://arcadejs.com/errors/ARCADE_SYNC_POLICY_UNEXTRACTABLE',
	};
}

function fallbackSpan(filename: string): SourceSpan {
	return {
		filename,
		start: 0,
		end: 0,
	};
}

function getElementTagName(node: AnyNode): string | null {
	return (
		getIdentifierName(node.id as AnyNode | undefined) ??
		getIdentifierName((node.openingElement as AnyNode | undefined)?.name as AnyNode | undefined)
	);
}

function getElementAttributes(node: AnyNode): AnyNode[] {
	const directAttributes = asNodes(node.attributes);
	if (directAttributes.length > 0) {
		return directAttributes;
	}

	return asNodes((node.openingElement as AnyNode | undefined)?.attributes);
}

function isHostTagName(name: string): boolean {
	return name.length > 0 && name[0] === name[0].toLowerCase();
}

function unwrapExpressionContainer(node: AnyNode | undefined): AnyNode | undefined {
	if (node?.type === 'JSXExpressionContainer' || node?.type === 'TSRXExpression') {
		return node.expression as AnyNode | undefined;
	}

	return node;
}

function behaviorExpressions(node: AnyNode): AnyNode[] {
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}

function behaviorSourceParts(node: AnyNode, source: string): Omit<SemanticBehavior, 'hostNodeId'> {
	const behaviorSource = expressionSource(node, source);

	if (node.type !== 'CallExpression') {
		return {
			source: behaviorSource,
			functionSource: behaviorSource,
			inputSources: [],
		};
	}

	const callee = node.callee as AnyNode | undefined;

	return {
		source: behaviorSource,
		functionSource: callee ? expressionSource(callee, source) : behaviorSource,
		inputSources: asNodes(node.arguments).map((argument) => expressionSource(argument, source)),
	};
}

function eventHandlerExpressions(node: AnyNode | undefined): AnyNode[] {
	if (!node) return [];
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
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
