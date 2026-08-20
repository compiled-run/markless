import { asNodes, childNodes, isNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import {
	stateWriteInComputedDiagnostic,
	stateWriteInTemplateDiagnostic,
	templateAsValueDiagnostic,
} from './diagnostics.ts';
import type { DeferredComputedWrite, WalkState } from './types.ts';

export function collectAssignment(node: AnyNode, state: WalkState): void {
	const target = unwrapChainExpression(node.left as AnyNode | undefined);
	if (!target) return;
	const operator = typeof node.operator === 'string' ? node.operator : '=';
	const value = node.right as AnyNode | undefined;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		...writeScope(state),
		targetSpan: sourceSpan(target, state.filename),
		operation: 'assign',
		assignmentOperator: operator === '=' ? undefined : operator,
		valueSource: value ? expressionSource(value, state.source) : undefined,
		valueSpan: value ? sourceSpan(value, state.filename) : undefined,
	});
}

export function collectUpdate(node: AnyNode, state: WalkState): void {
	const target = unwrapChainExpression(node.argument as AnyNode | undefined);
	if (!target) return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		...writeScope(state),
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
		...writeScope(state),
		targetSpan: sourceSpan(target, state.filename),
		operation: 'call',
		method,
		argumentSources: asNodes(node.arguments).map((argument) =>
			expressionSource(argument, state.source),
		),
		optional:
			node.optional === true || callee.optional === true || isChainExpression(node.callee),
	});
}

const templateValueTypes = new Set([
	'Element',
	'JSXElement',
	'Fragment',
	'JSXFragment',
	'JSXIfExpression',
	'JSXForExpression',
	'JSXSwitchExpression',
	'JSXTryExpression',
]);

export function findTemplateValue(node: AnyNode | undefined): AnyNode | null {
	if (!node) return null;
	if (templateValueTypes.has(node.type ?? '')) return node;
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
		...writeScope(state),
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
		const previousShadowedBindings = state.shadowedBindingNames;
		state.shadowedBindingNames = new Set(previousShadowedBindings);
		for (const name of bindingNames(node.id as AnyNode | undefined)) {
			state.shadowedBindingNames.add(name);
		}
		for (const parameter of asNodes(node.params)) {
			for (const name of bindingNames(parameter)) state.shadowedBindingNames.add(name);
		}
		for (const name of functionScopedBindingNames(node.body as AnyNode | undefined)) {
			state.shadowedBindingNames.add(name);
		}
		collectExpressionReads(node.body as AnyNode | undefined, state);
		state.shadowedBindingNames = previousShadowedBindings;
		return;
	}

	if (node.type === 'BlockStatement' || node.type === 'SwitchStatement') {
		withShadowedBindings(state, blockScopedBindingNames(node), () => {
			for (const child of childNodes(node)) collectExpressionReads(child, state);
		});
		return;
	}

	if (
		node.type === 'ForStatement' ||
		node.type === 'ForInStatement' ||
		node.type === 'ForOfStatement'
	) {
		withShadowedBindings(state, forHeadBindingNames(node), () => {
			for (const child of childNodes(node)) collectExpressionReads(child, state);
		});
		return;
	}

	if (node.type === 'CatchClause') {
		withShadowedBindings(state, bindingNames(node.param as AnyNode | undefined), () => {
			collectExpressionReads(node.body as AnyNode | undefined, state);
		});
		return;
	}

	if (node.type === 'VariableDeclaration') {
		withShadowedBindings(state, declarationBindingNames(node), () => {
			for (const declaration of asNodes(node.declarations)) {
				collectExpressionReads(declaration.init as AnyNode | undefined, state);
			}
		});
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
		// The rule bans writing *graph state* from a derive, because that is the
		// self-waking cycle. Writing a local accumulator or a plain object that
		// happens to live inside the derive is ordinary JavaScript. Whether the
		// target is graph state can depend on a binding declared later in the
		// component body, so the decision is deferred to a post-walk pass that
		// sees the finished graph.
		deferComputedWrite(target, diagnosticInput, state);
		return false;
	}

	if (state.currentHostNodeId && state.currentTextTarget) {
		state.graph.diagnostics.push(stateWriteInTemplateDiagnostic(diagnosticInput));
		return true;
	}

	return false;
}

function deferComputedWrite(
	target: AnyNode,
	diagnosticInput: DeferredComputedWrite['diagnosticInput'],
	state: WalkState,
): void {
	const targetSource = expressionSource(target, state.source);
	const rootName = graphPathRootName(targetSource);
	// A name declared inside the derive shadows any graph binding of the same
	// name, so it can never be the graph cell.
	if (!rootName || state.computedBodyLocalNames?.has(rootName)) return;

	state.deferredComputedWrites.push({
		writeIndex: state.graph.stateWrites.length,
		targetSource,
		diagnosticInput,
		sharedDefinitionId: state.currentSharedDefinitionId,
		componentName: state.currentComponentName,
	});
}

// Post-walk decision for every write recorded inside a computed body. Only a
// target that resolves to a graph binding (state, computed, shared, or prop) is
// the self-waking cycle the rule exists to stop; the recorded write for such a
// target is dropped so downstream passes never lower a banned write.
export function collectComputedWriteDiagnostics(state: WalkState): void {
	if (state.deferredComputedWrites.length === 0) return;

	const bannedWriteIndexes = new Set<number>();
	for (const candidate of state.deferredComputedWrites) {
		const resolved = resolveGraphPath(
			candidate.targetSource,
			graphBindingMap(state.graph, candidate.sharedDefinitionId, candidate.componentName),
			semanticAliasMap(state.graph, candidate.sharedDefinitionId, candidate.componentName),
		);
		if (!resolved) continue;
		state.graph.diagnostics.push(stateWriteInComputedDiagnostic(candidate.diagnosticInput));
		bannedWriteIndexes.add(candidate.writeIndex);
	}

	if (bannedWriteIndexes.size === 0) return;
	const kept = state.graph.stateWrites.filter((_, index) => !bannedWriteIndexes.has(index));
	state.graph.stateWrites.length = 0;
	state.graph.stateWrites.push(...kept);
}

export function graphPathRootName(source: string): string | null {
	if (!source) return null;
	return /^[$A-Z_a-z][$\w]*/.exec(source)?.[0] ?? null;
}

// Every name a derive body binds itself: its own parameters, and any
// declaration at any depth inside it. Collected conservatively — an extra name
// only means one fewer diagnostic, never a wrong one.
export function declaredBindingNamesDeep(node: AnyNode | undefined): Set<string> {
	const names = new Set<string>();
	const visit = (current: AnyNode | undefined): void => {
		if (!current) return;
		if (
			current.type === 'ArrowFunctionExpression' ||
			current.type === 'FunctionExpression' ||
			current.type === 'FunctionDeclaration'
		) {
			for (const name of bindingNames(current.id as AnyNode | undefined)) names.add(name);
			for (const parameter of asNodes(current.params)) {
				for (const name of bindingNames(parameter)) names.add(name);
			}
		} else if (current.type === 'VariableDeclaration') {
			for (const name of declarationBindingNames(current)) names.add(name);
		} else if (current.type === 'ClassDeclaration' || current.type === 'ClassExpression') {
			for (const name of bindingNames(current.id as AnyNode | undefined)) names.add(name);
		} else if (current.type === 'CatchClause') {
			for (const name of bindingNames(current.param as AnyNode | undefined)) names.add(name);
		}
		for (const child of childNodes(current)) visit(child);
	};
	visit(node);
	return names;
}

function unwrapChainExpression(node: AnyNode | undefined): AnyNode | undefined {
	return node?.type === 'ChainExpression' ? (node.expression as AnyNode | undefined) : node;
}

function isChainExpression(node: unknown): boolean {
	return isNode(node) && node.type === 'ChainExpression';
}

function addStateRead(node: AnyNode, state: WalkState): void {
	const source = expressionSource(node, state.source);
	if (!source) return;
	const rootName = /^[$A-Z_a-z][$\w]*/.exec(source)?.[0];
	if (rootName && state.shadowedBindingNames.has(rootName)) return;

	const resolved = resolveGraphPath(
		source,
		graphBindingMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
	);

	state.graph.stateReads.push({
		source,
		...sharedScope(state),
		...(resolved?.bindingId ? { bindingId: resolved.bindingId } : {}),
		...(resolved?.componentName
			? { componentName: resolved.componentName }
			: state.currentComponentName
				? { componentName: state.currentComponentName }
				: {}),
		sourceSpan: sourceSpan(node, state.filename),
	});
}

function bindingNames(node: AnyNode | undefined): string[] {
	if (!node) return [];
	if (node.type === 'Identifier') return [String(node.name ?? '')].filter(Boolean);
	if (node.type === 'AssignmentPattern') return bindingNames(node.left as AnyNode | undefined);
	if (node.type === 'RestElement') return bindingNames(node.argument as AnyNode | undefined);
	if (node.type === 'ObjectPattern') {
		return asNodes(node.properties).flatMap((property) =>
			property.type === 'Property'
				? bindingNames(property.value as AnyNode | undefined)
				: bindingNames(property.argument as AnyNode | undefined),
		);
	}
	if (node.type === 'ArrayPattern') {
		return asNodes(node.elements).flatMap((element) => bindingNames(element));
	}

	return [];
}

function declarationBindingNames(node: AnyNode | undefined): string[] {
	if (node?.type !== 'VariableDeclaration') return [];
	return asNodes(node.declarations).flatMap((declaration) =>
		bindingNames(declaration.id as AnyNode | undefined),
	);
}

function blockScopedBindingNames(node: AnyNode): string[] {
	const statements =
		node.type === 'SwitchStatement'
			? asNodes(node.cases).flatMap((switchCase) => asNodes(switchCase.consequent))
			: asNodes(node.body);
	return statements.flatMap((statement) => {
		if (
			statement.type === 'VariableDeclaration' &&
			(statement.kind === 'const' || statement.kind === 'let')
		) {
			return declarationBindingNames(statement);
		}
		if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
			return bindingNames(statement.id as AnyNode | undefined);
		}
		return [];
	});
}

function functionScopedBindingNames(node: AnyNode | undefined): string[] {
	if (!node) return [];
	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	) {
		return [];
	}
	const own =
		node.type === 'VariableDeclaration' && node.kind === 'var'
			? declarationBindingNames(node)
			: [];
	return [...own, ...childNodes(node).flatMap(functionScopedBindingNames)];
}

function forHeadBindingNames(node: AnyNode): string[] {
	return [node.init, node.left].flatMap((head) =>
		declarationBindingNames(head as AnyNode | undefined),
	);
}

function withShadowedBindings(
	state: WalkState,
	names: ReadonlyArray<string>,
	visit: () => void,
): void {
	if (names.length === 0) {
		visit();
		return;
	}
	const previousShadowedBindings = state.shadowedBindingNames;
	state.shadowedBindingNames = new Set(previousShadowedBindings);
	for (const name of names) state.shadowedBindingNames.add(name);
	visit();
	state.shadowedBindingNames = previousShadowedBindings;
}

function sharedScope(state: WalkState): { readonly sharedDefinitionId?: string } {
	return state.currentSharedDefinitionId
		? { sharedDefinitionId: state.currentSharedDefinitionId }
		: {};
}

function writeScope(state: WalkState): {
	readonly writeScope: 'component' | 'handler' | 'helper' | 'computed' | 'module';
	readonly componentName?: string;
} {
	if (state.currentFunctionSite) {
		return {
			writeScope: state.currentFunctionSite,
			componentName: state.currentComponentName ?? undefined,
		};
	}

	return state.currentComponentName
		? { writeScope: 'component', componentName: state.currentComponentName }
		: { writeScope: 'module' };
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
