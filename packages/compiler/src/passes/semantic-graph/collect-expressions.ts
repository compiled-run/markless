import { asNodes, childNodes, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	stateWriteInComputedDiagnostic,
	stateWriteInTemplateDiagnostic,
	templateAsValueDiagnostic,
} from './diagnostics.ts';
import type { WalkState } from './types.ts';

export function collectAssignment(node: AnyNode, state: WalkState): void {
	const target = unwrapChainExpression(node.left as AnyNode | undefined);
	if (!target) return;
	const operator = typeof node.operator === 'string' ? node.operator : '=';
	const value = node.right as AnyNode | undefined;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		targetSpan: sourceSpan(target, state.filename),
		operation: 'assign',
		assignmentOperator: operator === '=' ? undefined : operator,
		valueSource: value ? expressionSource(value, state.source) : undefined,
	});
}

export function collectUpdate(node: AnyNode, state: WalkState): void {
	const target = unwrapChainExpression(node.argument as AnyNode | undefined);
	if (!target) return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		targetSpan: sourceSpan(target, state.filename),
		operation: 'update',
		prefix: node.prefix === true,
		updateOperator: node.operator === '--' ? '--' : '++',
	});
}

export function collectCollectionCall(node: AnyNode, state: WalkState): void {
	const callee = unwrapChainExpression(node.callee as AnyNode | undefined);
	if (callee?.type !== 'MemberExpression') return;

	const method = getStaticMemberPropertyName(callee);
	if (!method || !isMutatingCollectionMethod(method)) return;

	const target = unwrapChainExpression(callee.object as AnyNode | undefined);
	if (!target) return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	for (const argument of asNodes(node.arguments)) {
		const templateValue = findTemplateValue(argument);
		if (!templateValue) continue;
		state.graph.diagnostics.push(
			templateAsValueDiagnostic({
				siteSource: expressionSource(node, state.source),
				node: templateValue,
				filename: state.filename,
			}),
		);
		markTemplateValueHandled(templateValue);
	}

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		targetSpan: sourceSpan(target, state.filename),
		operation: 'call',
		method,
		argumentSources: asNodes(node.arguments).map((argument) =>
			expressionSource(argument, state.source),
		),
		optional: node.optional === true || callee.optional === true || isChainExpression(node.callee),
	});
}

const templateValueTypes = new Set([
	'Element', 'JSXElement', 'Fragment', 'JSXFragment',
	'JSXIfExpression', 'JSXForExpression', 'JSXSwitchExpression', 'JSXTryExpression',
]);

export function findTemplateValue(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (templateValueTypes.has(node.type)) return node;
	if (node.type !== 'ArrayExpression') return null;
	for (const element of asNodes(node.elements)) {
		const found = findTemplateValue(element);
		if (found) return found;
	}
	return null;
}

export function markTemplateValueHandled(node: AnyNode): void {
	Object.assign(node, { type: 'MarklessTemplateValue' });
}

export function collectDelete(node: AnyNode, state: WalkState): void {
	if (node.operator !== 'delete') return;

	const originalTarget = node.argument as AnyNode | undefined;
	const target = unwrapChainExpression(originalTarget);
	if (target?.type !== 'MemberExpression') return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(originalTarget ?? target, state.source),
		...sharedScope(state),
		targetSpan: sourceSpan(originalTarget ?? target, state.filename),
		operation: 'delete',
		optional: target.optional === true || isChainExpression(originalTarget),
	});
}

export function collectExpressionReads(node: AnyNode | undefined, state: WalkState): void {
	if (!node) return;

	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	) {
		collectExpressionReads(node.body as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'AssignmentExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '=';
		if (operator !== '=') {
			collectExpressionReads(node.left as AnyNode | undefined, state);
		}
		collectExpressionReads(node.right as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'UpdateExpression') {
		collectExpressionReads(node.argument as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'UnaryExpression' && node.operator === 'delete') {
		collectDeleteComputedPropertyReads(node.argument as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'CallExpression') {
		const callee = node.callee as AnyNode | undefined;
		if (callee?.type === 'MemberExpression') {
			const method = getStaticMemberPropertyName(callee);
			if (method && isMutatingCollectionMethod(method)) {
				collectExpressionReads(callee.object as AnyNode | undefined, state);
				for (const argument of asNodes(node.arguments)) {
					collectExpressionReads(argument, state);
				}
				return;
			}
		}
	}

	if (node.type === 'ChainExpression') {
		collectExpressionReads(node.expression as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'MemberExpression') {
		addStateRead(node, state);

		if (node.computed === true) {
			collectExpressionReads(node.property as AnyNode | undefined, state);
		}
		return;
	}

	if (node.type === 'Identifier') {
		addStateRead(node, state);
		return;
	}

	for (const child of childNodes(node)) {
		collectExpressionReads(child, state);
	}
}

function collectDeleteComputedPropertyReads(node: AnyNode | undefined, state: WalkState): void {
	node = unwrapChainExpression(node);
	if (node?.type !== 'MemberExpression') return;
	if (node.computed !== true) return;

	collectExpressionReads(node.property as AnyNode | undefined, state);
}

function diagnoseBannedWriteSite(node: AnyNode, target: AnyNode, state: WalkState): boolean {
	const diagnosticInput = {
		source: expressionSource(node, state.source),
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		filename: state.filename,
	};

	if (state.currentCreationSite === 'computed') {
		state.graph.diagnostics.push(stateWriteInComputedDiagnostic(diagnosticInput));
		return true;
	}

	if (state.currentHostNodeId && state.currentTextTarget) {
		state.graph.diagnostics.push(stateWriteInTemplateDiagnostic(diagnosticInput));
		return true;
	}

	return false;
}

function unwrapChainExpression(node: AnyNode | undefined): AnyNode | undefined {
	return node?.type === 'ChainExpression' ? (node.expression as AnyNode | undefined) : node;
}

function isChainExpression(node: AnyNode | undefined): boolean {
	return node?.type === 'ChainExpression';
}

function addStateRead(node: AnyNode, state: WalkState): void {
	const source = expressionSource(node, state.source);
	if (!source) return;

	state.graph.stateReads.push({
		source,
		...sharedScope(state),
		sourceSpan: sourceSpan(node, state.filename),
	});
}

function sharedScope(state: WalkState): { readonly sharedDefinitionId?: string } {
	return state.currentSharedDefinitionId
		? { sharedDefinitionId: state.currentSharedDefinitionId }
		: {};
}

function getStaticMemberPropertyName(member: AnyNode): string | null {
	const property = member.property as AnyNode | undefined;
	if (!property) return null;

	if (member.computed === true) {
		if (typeof property.value === 'string' || typeof property.value === 'number') {
			return String(property.value);
		}

		return null;
	}

	if (typeof property.name === 'string') return property.name;
	if (typeof property.value === 'string' || typeof property.value === 'number') {
		return String(property.value);
	}

	return null;
}

function isMutatingCollectionMethod(name: string): boolean {
	return (
		name === 'add' ||
		name === 'clear' ||
		name === 'copyWithin' ||
		name === 'delete' ||
		name === 'fill' ||
		name === 'pop' ||
		name === 'push' ||
		name === 'reverse' ||
		name === 'set' ||
		name === 'shift' ||
		name === 'sort' ||
		name === 'splice' ||
		name === 'unshift' ||
		isMutatingDateMethod(name)
	);
}

function isMutatingDateMethod(name: string): boolean {
	return (
		name === 'setDate' ||
		name === 'setFullYear' ||
		name === 'setHours' ||
		name === 'setMilliseconds' ||
		name === 'setMinutes' ||
		name === 'setMonth' ||
		name === 'setSeconds' ||
		name === 'setTime' ||
		name === 'setUTCDate' ||
		name === 'setUTCFullYear' ||
		name === 'setUTCHours' ||
		name === 'setUTCMilliseconds' ||
		name === 'setUTCMinutes' ||
		name === 'setUTCMonth' ||
		name === 'setUTCSeconds' ||
		name === 'setYear'
	);
}
