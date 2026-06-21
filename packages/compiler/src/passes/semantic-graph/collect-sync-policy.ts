import { asNodes, getIdentifierName, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	uniqueBy,
} from '../../artifact-helpers/graph-paths.ts';
import type {
	SemanticSyncPolicy,
	SemanticSyncPolicyAction,
	SemanticSyncPolicyBranch,
	SemanticSyncPolicyCondition,
} from '../../artifacts.ts';
import type { WalkState } from './types.ts';

export function getHandlerCount(node: AnyNode | undefined): number {
	if (!node) return 0;
	if (node.type === 'ArrayExpression') return asNodes(node.elements).length;
	return 1;
}

export function extractSyncPolicy(
	node: AnyNode | undefined,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicy | undefined {
	const branches: SemanticSyncPolicyBranch[] = [];

	for (const handler of handlerExpressions(node)) {
		const eventParam = getIdentifierName(asNodes(handler.params)[0]) ?? 'event';
		const policy = extractSyncPolicyFromBody(
			handler.body as AnyNode | undefined,
			eventParam,
			state,
		);
		if (policy) branches.push(policy);
	}

	if (branches.length === 0) return undefined;
	if (branches.length === 1) return branches[0];

	return { branches };
}

export function hasSyncEventPolicyCandidate(node: AnyNode | undefined): boolean {
	return firstSyncPolicyActionCall(node) !== null;
}

export function firstSyncPolicyActionCall(
	node: AnyNode | undefined,
): { readonly action: SemanticSyncPolicyAction; readonly node: AnyNode } | null {
	let found: { readonly action: SemanticSyncPolicyAction; readonly node: AnyNode } | null = null;

	walkNode(node, (candidate) => {
		if (found) return;
		if (candidate.type !== 'CallExpression') return;

		const callee = candidate.callee as AnyNode | undefined;
		if (callee?.type !== 'MemberExpression') return;

		const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
		if (propertyName === 'preventDefault' || propertyName === 'stopPropagation') {
			found = { action: propertyName, node: candidate };
		}
	});

	return found;
}

function handlerExpressions(node: AnyNode | undefined): AnyNode[] {
	if (!node) return [];
	if (node.type === 'ArrayExpression') return asNodes(node.elements);
	return [node];
}

function extractSyncPolicyFromBody(
	body: AnyNode | undefined,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicyBranch | undefined {
	if (!body) return undefined;

	const statements = body.type === 'BlockStatement' ? asNodes(body.body) : [body];
	for (const statement of statements) {
		if (statement.type !== 'IfStatement') continue;

		const actions = extractSyncActions(statement.consequent as AnyNode | undefined, eventParam);
		if (actions.length === 0) continue;

		const when = extractSyncCondition(statement.test as AnyNode | undefined, eventParam, state);
		if (!when) continue;

		return { when, actions };
	}

	return undefined;
}

function extractSyncActions(
	node: AnyNode | undefined,
	eventParam: string,
): SemanticSyncPolicyAction[] {
	const actions: SemanticSyncPolicyAction[] = [];

	walkNode(node, (candidate) => {
		if (candidate.type !== 'CallExpression') return;

		const callee = candidate.callee as AnyNode | undefined;
		if (callee?.type !== 'MemberExpression') return;
		if (getIdentifierName(callee.object as AnyNode | undefined) !== eventParam) return;

		const propertyName = getStaticPropertyName(callee.property as AnyNode | undefined);
		if (propertyName === 'preventDefault' || propertyName === 'stopPropagation') {
			actions.push(propertyName);
		}
	});

	return uniqueBy(actions, (action) => action);
}

function extractSyncCondition(
	node: AnyNode | undefined,
	eventParam: string,
	state: Pick<WalkState, 'graph' | 'source'>,
): SemanticSyncPolicyCondition | undefined {
	if (!node) return undefined;

	if (node.type === 'LogicalExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		const left = extractSyncCondition(node.left as AnyNode | undefined, eventParam, state);
		const right = extractSyncCondition(node.right as AnyNode | undefined, eventParam, state);
		if (!left || !right) return undefined;

		if (operator === '&&') {
			return { type: 'and', conditions: flattenSyncConditions('and', [left, right]) };
		}
		if (operator === '||') {
			return { type: 'or', conditions: flattenSyncConditions('or', [left, right]) };
		}

		return undefined;
	}

	if (node.type === 'BinaryExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		if (operator !== '===' && operator !== '==') return undefined;

		const leftField = eventFieldName(node.left as AnyNode | undefined, eventParam);
		const rightValue = literalValue(node.right as AnyNode | undefined);
		if (leftField && rightValue.ok) {
			return { type: 'event-equals', field: leftField, value: rightValue.value };
		}

		const rightField = eventFieldName(node.right as AnyNode | undefined, eventParam);
		const leftValue = literalValue(node.left as AnyNode | undefined);
		if (rightField && leftValue.ok) {
			return { type: 'event-equals', field: rightField, value: leftValue.value };
		}

		return undefined;
	}

	if (node.type === 'UnaryExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '';
		if (operator !== '!') return undefined;

		const condition = extractSyncCondition(
			node.argument as AnyNode | undefined,
			eventParam,
			state,
		);
		if (!condition) return undefined;

		return { type: 'not', condition };
	}

	const resolved = resolveGraphPath(
		expressionSource(node, state.source),
		graphBindingMap(state.graph),
		semanticAliasMap(state.graph),
	);
	if (!resolved) {
		const constant = syncPolicyConstantValue(node, state.graph.syncPolicyConstants ?? []);
		if (!constant.ok) return undefined;

		return {
			type: 'constant-truthy',
			value: constant.value,
		};
	}

	return {
		type: 'graph-truthy',
		graphNodeId: resolved.binding.id,
		path: resolved.path,
	};
}

function syncPolicyConstantValue(
	node: AnyNode,
	constants: ReadonlyArray<{ readonly name: string; readonly value: unknown }>,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	const path = staticExpressionPath(node);
	if (!path) return { ok: false };
	const [name, ...segments] = path;

	for (let index = constants.length - 1; index >= 0; index--) {
		const constant = constants[index];
		if (constant.name === name) {
			return { ok: true, value: readStaticPath(constant.value, segments) };
		}
	}

	return { ok: false };
}

function staticExpressionPath(node: AnyNode | undefined | null): ReadonlyArray<string> | null {
	if (!node) return null;

	const name = getIdentifierName(node);
	if (name) return [name];

	if (node.type !== 'MemberExpression') return null;

	const parent = staticExpressionPath(node.object as AnyNode | undefined);
	const property = getStaticPropertyName(node.property as AnyNode | undefined);
	if (!parent || !property) return null;

	return [...parent, property];
}

function readStaticPath(value: unknown, path: ReadonlyArray<string>): unknown {
	let current = value;

	for (const segment of path) {
		if (current == null) return undefined;
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

function flattenSyncConditions(
	type: 'and' | 'or',
	conditions: ReadonlyArray<SemanticSyncPolicyCondition>,
): ReadonlyArray<SemanticSyncPolicyCondition> {
	return conditions.flatMap((condition) => {
		if (condition.type === type) return condition.conditions;
		return [condition];
	});
}

function eventFieldName(node: AnyNode | undefined, eventParam: string): string | null {
	if (node?.type !== 'MemberExpression') return null;
	if (getIdentifierName(node.object as AnyNode | undefined) !== eventParam) return null;

	return getStaticPropertyName(node.property as AnyNode | undefined);
}

function literalValue(
	node: AnyNode | undefined,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
	if (node?.type !== 'Literal') return { ok: false };

	return { ok: true, value: node.value };
}

function getStaticPropertyName(node: AnyNode | undefined): string | null {
	if (!node) return null;
	if (typeof node.name === 'string') return node.name;
	if (typeof node.value === 'string' || typeof node.value === 'number') return String(node.value);
	return null;
}
