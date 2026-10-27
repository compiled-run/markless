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
import { repeatRowBindsName } from './collect-repeat.ts';
import { collectStateEscapes } from './collect-state-escapes.ts';
import { getFrameworkApiForCall } from './imports.ts';
import type { SemanticStateWrite } from '../../artifacts.ts';
import type { DeferredComputedWrite, WalkState } from './types.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import { writeThroughLocal } from './write-through-locals.ts';

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
		...rowWriteScope(target, state),
		...throughField(target, state, 'assign'),
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
		...rowWriteScope(target, state),
		...throughField(target, state, 'update'),
		operation: 'update',
		prefix: node.prefix === true,
		updateOperator: node.operator === '--' ? '--' : '++',
	});
}

// `Object.assign(target, ...sources)` onto state is a write of each member the sources carry.
export function collectObjectAssign(node: AnyNode, state: WalkState): void {
	const callee = unwrapChainExpression(node.callee as AnyNode | undefined);
	if (callee?.type !== 'MemberExpression' || getStaticMemberPropertyName(callee) !== 'assign')
		return;
	const owner = unwrapValueWrappers(callee.object as AnyNode | undefined);
	if (owner?.type !== 'Identifier' || owner.name !== 'Object' || !isGlobalReference(owner, state))
		return;
	const [first, ...sources] = asNodes(node.arguments);
	const target = unwrapValueWrappers(first);
	if (!target || first?.type === 'SpreadElement' || isFreshValue(target, state)) return;
	if (target.type !== 'Identifier' && target.type !== 'MemberExpression') return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		...writeScope(state),
		targetSpan: sourceSpan(target, state.filename),
		...rowWriteScope(target, state),
		...throughField(target, state, 'call'),
		operation: 'call',
		method: 'assign',
		objectAssign: true,
		argumentSources: sources.map((source) => expressionSource(source, state.source)),
	});
}

export function collectCollectionCall(node: AnyNode, state: WalkState): void {
	const callee = unwrapChainExpression(node.callee as AnyNode | undefined);
	if (callee?.type !== 'MemberExpression') return;

	const method = getStaticMemberPropertyName(callee);
	if (!method || !isMutatingCollectionMethod(method)) return;

	const target = unwrapChainExpression(callee.object as AnyNode | undefined);
	if (!target) return;
	if (isFreshValue(target, state)) return;
	if (diagnoseBannedWriteSite(node, target, state)) return;

	for (const argument of asNodes(node.arguments)) {
		const templateValue = findTemplateValue(argument, state.handledTemplateValues);
		if (!templateValue) continue;
		state.graph.diagnostics.push(
			templateAsValueDiagnostic({
				siteSource: expressionSource(node, state.source),
				node: templateValue,
				filename: state.filename,
			}),
		);
		markTemplateValueHandled(templateValue, state);
	}

	state.graph.stateWrites.push({
		target: expressionSource(target, state.source),
		...sharedScope(state),
		...writeScope(state),
		targetSpan: sourceSpan(target, state.filename),
		...rowWriteScope(target, state),
		...throughField(target, state, 'call'),
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

export function findTemplateValue(
	node: AnyNode | undefined,
	handled: WeakSet<object>,
): AnyNode | null {
	if (!node) return null;
	if (handled.has(node)) return null;
	if (templateValueTypes.has(node.type ?? '')) return node;
	if (node.type !== 'ArrayExpression') return null;
	for (const element of asNodes(node.elements)) {
		const found = findTemplateValue(element, handled);
		if (found) return found;
	}
	return null;
}

// Side record, never a rewrite of `node.type`: the parsed tree is shared between
// compiles of the same source, so a mark written into it would outlive this walk.
export function markTemplateValueHandled(node: AnyNode, state: WalkState): void {
	state.handledTemplateValues.add(node);
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
		...rowWriteScope(target, state),
		...throughField(target, state, 'delete'),
		operation: 'delete',
		optional: target.optional === true || isChainExpression(originalTarget),
	});
}

/** The generic walk's write cases, applied inside a write's value and nested function bodies. */
export function collectWritesIn(node: AnyNode | undefined, state: WalkState): void {
	if (!node) return;

	if (node.type === 'AssignmentExpression') {
		collectAssignment(node, state);
		collectWritesIn(node.right as AnyNode | undefined, state);
		return;
	}

	if (node.type === 'UpdateExpression') {
		collectUpdate(node, state);
		return;
	}

	if (node.type === 'UnaryExpression' && node.operator === 'delete') {
		collectDelete(node, state);
		return;
	}

	if (getFrameworkApiForCall(node, state.frameworkApiImports) === 'computed') return;

	if (node.type === 'CallExpression') {
		collectCollectionCall(node, state);
		collectObjectAssign(node, state);
	}
	if (node.type === 'CallExpression' || node.type === 'NewExpression')
		collectStateEscapes(node, state);

	for (const child of childNodes(node)) collectWritesIn(child, state);
}

/**
 * The source range of the expression a single collection is walking. A name
 * declared inside it is that expression's own binding, so a use of it refers to
 * the local rather than to graph state - whatever the two are called.
 */
export type ReadRegion = {
	readonly start: number;
	readonly end: number;
};

export function collectExpressionReads(node: AnyNode | undefined, state: WalkState): void {
	if (!node) return;

	collectReadsIn(node, state, readRegion(node));
}

export function readRegion(node: AnyNode | undefined): ReadRegion | null {
	if (!node) return null;
	return typeof node.start === 'number' && typeof node.end === 'number'
		? { start: node.start, end: node.end }
		: null;
}

function collectReadsIn(
	node: AnyNode | undefined,
	state: WalkState,
	region: ReadRegion | null,
): void {
	if (!node) return;

	if (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	) {
		// Parameters and the function's own name are declarations, not reads.
		collectReadsIn(node.body as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'CatchClause') {
		// The caught binding is a declaration, not a read.
		collectReadsIn(node.body as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'VariableDeclaration') {
		// Only the initializers read; the declared patterns bind.
		for (const declaration of asNodes(node.declarations)) {
			collectReadsIn(declaration.init as AnyNode | undefined, state, region);
		}
		return;
	}

	if (node.type === 'AssignmentExpression') {
		const operator = typeof node.operator === 'string' ? node.operator : '=';
		if (operator !== '=') {
			collectReadsIn(node.left as AnyNode | undefined, state, region);
		}
		collectReadsIn(node.right as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'UpdateExpression') {
		collectReadsIn(node.argument as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'UnaryExpression' && node.operator === 'delete') {
		collectDeleteComputedPropertyReads(node.argument as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'CallExpression') {
		const callee = node.callee as AnyNode | undefined;
		if (callee?.type === 'MemberExpression') {
			const method = getStaticMemberPropertyName(callee);
			if (
				method &&
				(isMutatingCollectionMethod(method) || callsMethodOnReadValue(callee, state))
			) {
				collectReadsIn(callee.object as AnyNode | undefined, state, region);
				for (const argument of asNodes(node.arguments)) {
					collectReadsIn(argument, state, region);
				}
				return;
			}
		}
		// An optional method callee stays one read: the handle-call and callback-slot paths match it whole.
		if (
			callee?.type === 'MemberExpression' &&
			hasOptionalLink(callee) &&
			namesABinding(callee)
		) {
			addStateRead(callee, state, region);
			if (callee.computed === true) {
				collectReadsIn(callee.property as AnyNode | undefined, state, region);
			}
			for (const argument of asNodes(node.arguments)) {
				collectReadsIn(argument, state, region);
			}
			return;
		}
	}

	if (node.type === 'ChainExpression') {
		collectReadsIn(node.expression as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'Property') {
		// A static key names a field; it reads nothing. A computed one evaluates
		// an expression, exactly as `a[b]` does. Shorthand `{ count }` parses to a
		// key and a value node over the same identifier, so visiting only the value
		// records the single read the source actually writes.
		if (node.computed === true) {
			collectReadsIn(node.key as AnyNode | undefined, state, region);
		}
		collectReadsIn(node.value as AnyNode | undefined, state, region);
		return;
	}

	if (node.type === 'MemberExpression') {
		// A member path standing on a computed value - `(a ? b : c).length`, a
		// template literal, a call result - names no binding, so recording the
		// whole spelling as one read hides the graph reads inside the receiver.
		// An optional link can short-circuit, so the read stops at the value before it.
		if (!namesABinding(node) || hasOptionalLink(node) || chainKeysIntoOneStateCell(node, state)) {
			collectReadsIn(node.object as AnyNode | undefined, state, region);
			if (node.computed === true) {
				collectReadsIn(node.property as AnyNode | undefined, state, region);
			}
			return;
		}

		addStateRead(node, state, region);

		if (node.computed === true) {
			collectReadsIn(node.property as AnyNode | undefined, state, region);
		}
		return;
	}

	if (node.type === 'Identifier') {
		addStateRead(node, state, region);
		return;
	}

	for (const child of childNodes(node)) {
		collectReadsIn(child, state, region);
	}
}

/**
 * Whether `callee` calls a method *on* a read value rather than calling a member
 * the graph itself declares.
 *
 * `otp.value.slice(0, n)` reads `otp.value` and calls a string method on it, so
 * the read has to land on the receiver: recording it at the whole callee chain
 * lowers to `read(id, ["value", "slice"])(0, n)`, a detached function invoked
 * with no `this`. `otp.onChange?.(code)` and `otp.commit()` are the other shape -
 * the member itself is the callable the graph holds - and their read stays at
 * the chain so the callback-slot and shared-method paths keep matching it.
 *
 * A graph-declared callable is always written directly on the binding, so a
 * receiver that is itself a member path is a value. A binding whose cell holds a
 * scalar, an array, or a derived result is a value too: only an object cell can
 * carry the shared methods and callback slots the graph declares, so anything
 * else names an `Array.prototype`/`String.prototype`-style method on the value.
 */
function callsMethodOnReadValue(callee: AnyNode, state: WalkState): boolean {
	if (callee.computed === true) return false;

	const object = unwrapValueWrappers(callee.object as AnyNode | undefined);
	if (!object) return false;
	if (object.type === 'MemberExpression') return true;
	// Anything that is neither a name nor a member path is a value the expression
	// computed - a ternary, a template literal, a call result - so the method sits
	// on that value and the reads to record live inside it.
	if (!isBindingRoot(object)) return true;
	if (object.type !== 'Identifier') return false;

	const source = expressionSource(object, state.source);
	if (!source) return false;

	const resolved = resolveGraphPath(
		source,
		graphBindingMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
	);
	if (!resolved) return false;
	// A destructured prop (`{ dock }`) aliases `props.dock`: the receiver is already a member path.
	if (resolved.binding.kind === 'prop' && resolved.path.length > 0) return true;

	if (resolved.binding.kind === 'computed') return true;
	// A state() cell holds serializable data, never a callable the graph declares.
	if (resolved.binding.kind === 'state' && resolved.binding.valueKind === 'unknown') return true;
	return resolved.binding.valueKind === 'scalar' || resolved.binding.valueKind === 'array';
}

function collectDeleteComputedPropertyReads(
	node: AnyNode | undefined,
	state: WalkState,
	region: ReadRegion | null,
): void {
	node = unwrapChainExpression(node);
	if (node?.type !== 'MemberExpression') return;
	if (node.computed !== true) return;

	collectReadsIn(node.property as AnyNode | undefined, state, region);
}

function diagnoseBannedWriteSite(node: AnyNode, target: AnyNode, state: WalkState): boolean {
	const diagnosticInput = {
		source: expressionSource(node, state.source),
		target: expressionSource(target, state.source),
		targetSpan: sourceSpan(target, state.filename),
		filename: state.filename,
	};

	if (state.currentCreationSite === 'computed') {
		const through = writeThroughLocal(target, state, 'assign');
		if (through && through.kind !== 'local') {
			state.graph.diagnostics.push(stateWriteInComputedDiagnostic(diagnosticInput));
			return true;
		}
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
	// A binding declared inside the derive shadows any graph binding of the same
	// name, so it can never be the graph cell.
	if (rootBindsInsideRegion(target, state, enclosingFunctionRegion(target, state))) return;

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

/**
 * Source range of the function a node sits directly inside, from yuku's scope
 * table. A write reaches the deferred path only while the walk is inside a
 * derive body and outside any function nested in it, so the innermost function
 * scope containing the write is exactly that derive body.
 */
function enclosingFunctionRegion(node: AnyNode, state: WalkState): ReadRegion | null {
	if (typeof node.start !== 'number') return null;

	const semantic = state.semantic();
	let innermost: ReadRegion | null = null;
	for (let scopeId = 0; scopeId < semantic.scopes.length; scopeId += 1) {
		if (semantic.scopes[scopeId]!.kind !== 'function') continue;
		const start = semantic.scopes[scopeId]!.node.start;
		// yuku scope ranges use an exclusive end, so a scope ending exactly at
		// the node's start does not contain it.
		if (start > node.start || semantic.scopes[scopeId]!.node.end <= node.start) continue;
		if (!innermost || start > innermost.start) {
			innermost = { start, end: semantic.scopes[scopeId]!.node.end };
		}
	}

	return innermost;
}

function unwrapChainExpression(node: AnyNode | undefined): AnyNode | undefined {
	return node?.type === 'ChainExpression' ? (node.expression as AnyNode | undefined) : node;
}

/**
 * Strips the wrappers that change no value - authored parentheses and the
 * optional-chain marker - so a receiver is judged by what it actually is.
 */
function unwrapValueWrappers(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	while (current?.type === 'ChainExpression' || current?.type === 'ParenthesizedExpression') {
		current = current.expression as AnyNode | undefined;
	}
	return current;
}

/** Whether a node can be the root of a path that names a binding. */
function isBindingRoot(node: AnyNode): boolean {
	return node.type === 'Identifier' || node.type === 'ThisExpression' || node.type === 'Super';
}

/**
 * Whether a member path spells out a binding - `tree.typeahead`, `items[i].label` -
 * rather than reaching into a value the surrounding expression just computed.
 */
function namesABinding(node: AnyNode): boolean {
	let current: AnyNode | undefined = node;
	while (current) {
		current = unwrapValueWrappers(current);
		if (!current) return false;
		if (current.type !== 'MemberExpression') return isBindingRoot(current);
		current = current.object as AnyNode | undefined;
	}
	return false;
}

export function hasOptionalLink(node: AnyNode): boolean {
	let current: AnyNode | undefined = node;
	while (current) {
		current = unwrapValueWrappers(current);
		if (current?.type !== 'MemberExpression') return false;
		if (current.optional === true) return true;
		current = current.object as AnyNode | undefined;
	}
	return false;
}

// `users[sel]` over one component state() cell reads the cell whole and the key,
// the rule a template position already follows; a shared instance's members are
// separate cells, so a key into one stays a dynamic-path refusal.
function chainKeysIntoOneStateCell(node: AnyNode, state: WalkState): boolean {
	for (
		let current: AnyNode | undefined = node;
		current?.type === 'MemberExpression';
		current = unwrapValueWrappers(current.object as AnyNode | undefined)
	)
		if (keysIntoOneStateCell(current, state)) return true;
	return false;
}

function keysIntoOneStateCell(node: AnyNode, state: WalkState): boolean {
	if (node.computed !== true) return false;
	const property = node.property as AnyNode | undefined;
	if (
		property?.type === 'Literal' ||
		property?.type === 'StringLiteral' ||
		property?.type === 'NumericLiteral'
	)
		return false;
	const object = unwrapValueWrappers(node.object as AnyNode | undefined);
	if (!object || !namesABinding(object)) return false;
	const source = expressionSource(object, state.source);
	if (!source) return false;
	const resolved = resolveGraphPath(
		source,
		graphBindingMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
		semanticAliasMap(state.graph, state.currentSharedDefinitionId, state.currentComponentName),
	);
	return (
		!!resolved &&
		(resolved.binding.kind === 'state' || resolved.binding.kind === 'computed') &&
		resolved.binding.sharedDefinitionId === undefined
	);
}

function isChainExpression(node: unknown): boolean {
	return isNode(node) && node.type === 'ChainExpression';
}

function addStateRead(node: AnyNode, state: WalkState, region: ReadRegion | null): void {
	const source = expressionSource(node, state.source);
	if (!source) return;
	if (rootBindsInsideRegion(node, state, region)) return;
	// An enclosing @for owns this name for the row, so no component-level or
	// module-level node answers for it however the two happen to be spelled.
	if (repeatRowBindsName(source, state)) return;

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

/**
 * Whether the leftmost identifier of a read - the root of `items[i].label`, of
 * `session.user`, or of a bare `count` - refers to a binding the collected
 * expression declares itself.
 *
 * The question is asked of yuku's resolved references rather than of a set of
 * names, because only resolution can tell a use of the graph cell from a use of
 * a local that happens to share its name: `var` hoisting past the declaration
 * site, a sibling block whose binding is out of scope here, a parameter that
 * shadows for the whole body. A binding declared inside the collected
 * expression is one the expression owns, so a use of it is not a graph read.
 */
export function rootBindsInsideRegion(
	node: AnyNode,
	state: WalkState,
	region: ReadRegion | null,
): boolean {
	if (!region) return false;

	const offset = rootIdentifierOffset(node, state.source);
	if (offset === null) return false;

	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, offset);
	if (symbolId === null) return false;

	const scopeId = semantic.bindings[symbolId]!.scope.id;
	return (
		semantic.scopes[scopeId]!.node.start >= region.start &&
		semantic.scopes[scopeId]!.node.end <= region.end
	);
}

/**
 * Source offset of the identifier a read starts with, or `null` when it starts
 * with something else - `this`, a parenthesis, a literal - and so has no
 * binding to resolve.
 */
export function rootIdentifierOffset(node: AnyNode, source: string): number | null {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;

	const raw = source.slice(node.start, node.end);
	return node.start + (raw.length - raw.trimStart().length);
}

/**
 * Identifier uses indexed by where they start, built once per analyzed module.
 * Type-position uses are skipped: they never contribute a runtime read, and
 * indexing them would let a type annotation answer for the value beside it.
 */
const valueReferenceSymbolsByOffset = new WeakMap<ModuleSemantics, Map<number, number>>();

/** The binding an identifier use at `offset` resolves to, if it resolves. */
export function resolvedSymbolAt(semantic: ModuleSemantics, offset: number): number | null {
	let symbolsByOffset = valueReferenceSymbolsByOffset.get(semantic);
	if (!symbolsByOffset) {
		symbolsByOffset = new Map<number, number>();
		for (let referenceId = 0; referenceId < semantic.references.length; referenceId += 1) {
			if (semantic.references[referenceId]!.inTypePosition) continue;
			const symbolId = semantic.references[referenceId]!.binding?.id ?? null;
			if (symbolId === null) continue;
			const start = semantic.references[referenceId]!.node.start;
			if (!symbolsByOffset.has(start)) symbolsByOffset.set(start, symbolId);
		}
		valueReferenceSymbolsByOffset.set(semantic, symbolsByOffset);
	}

	return symbolsByOffset.get(offset) ?? null;
}

/**
 * The keyed repeat whose row item this write target is rooted in. Decided by the
 * binding the root identifier resolves to, so a handler local that shadows the
 * item name is not mistaken for the row.
 */
function throughField(
	target: AnyNode,
	state: WalkState,
	operation: SemanticStateWrite['operation'],
): { readonly through?: NonNullable<ReturnType<typeof writeThroughLocal>> } {
	if (!state.currentFunctionSite) return {};
	const through = writeThroughLocal(target, state, operation);
	return through ? { through } : {};
}

function rowWriteScope(target: AnyNode, state: WalkState): { readonly rowRepeatId?: string } {
	if (state.currentKeyedRepeatScopeIds.length === 0) return {};
	const root = writeTargetRootIdentifier(target);
	if (!root || typeof root.start !== 'number') return {};

	for (let index = state.currentKeyedRepeatScopeIds.length - 1; index >= 0; index -= 1) {
		const repeatId = state.currentKeyedRepeatScopeIds[index]!;
		const repeat = state.graph.keyedRepeats.find((candidate) => candidate.id === repeatId);
		if (repeat?.itemName !== root.name) continue;

		const span = state.keyedRepeatItemSpans.get(repeatId);
		const semantic = state.semantic();
		const symbolId = resolvedSymbolAt(semantic, root.start);
		if (!span || symbolId === null) return {};
		const declaration = semantic.bindings[symbolId]!.declarations[0]!;
		return declaration.start >= span.start && declaration.end <= span.end
			? { rowRepeatId: repeatId }
			: {};
	}

	return {};
}

function writeTargetRootIdentifier(target: AnyNode): (AnyNode & { readonly name: string }) | null {
	let cursor: AnyNode | undefined = target;
	while (cursor) {
		if (cursor.type === 'Identifier' && typeof cursor.name === 'string')
			return cursor as AnyNode & { readonly name: string };
		if (cursor.type === 'MemberExpression') cursor = cursor.object as AnyNode | undefined;
		else if (cursor.type === 'ChainExpression')
			cursor = cursor.expression as AnyNode | undefined;
		else if (cursor.type === 'TSNonNullExpression')
			cursor = cursor.expression as AnyNode | undefined;
		else return null;
	}
	return null;
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

const copyReturningMethods = new Set([
	'concat',
	'filter',
	'flat',
	'flatMap',
	'map',
	'slice',
	'toReversed',
	'toSorted',
	'toSpliced',
	'with',
]);
const receiverReturningMethods = new Set(['copyWithin', 'fill', 'reverse', 'sort']);
const copyingStatics = new Map([
	['Array', new Set(['from', 'of'])],
	['Object', new Set(['entries', 'keys', 'values', 'fromEntries', 'assign'])],
]);

/**
 * Whether an expression always evaluates to a value no binding holds yet, so a
 * mutating call on it (`[...rows].sort()`) changes only that copy.
 */
function isFreshValue(node: AnyNode | undefined, state: WalkState): boolean {
	const value = unwrapValueWrappers(node);
	if (!value) return false;
	if (
		value.type === 'ArrayExpression' ||
		value.type === 'ObjectExpression' ||
		value.type === 'NewExpression'
	)
		return true;
	if (value.type !== 'CallExpression') return false;
	const callee = unwrapValueWrappers(value.callee as AnyNode | undefined);
	if (callee?.type === 'Identifier' && callee.name === 'structuredClone')
		return isGlobalReference(callee, state);
	if (callee?.type !== 'MemberExpression') return false;
	const method = getStaticMemberPropertyName(callee);
	if (!method) return false;
	if (copyReturningMethods.has(method)) return true;
	const receiver = unwrapValueWrappers(callee.object as AnyNode | undefined);
	if (receiverReturningMethods.has(method)) return isFreshValue(receiver, state);
	if (receiver?.type !== 'Identifier' || typeof receiver.name !== 'string') return false;
	if (method === 'assign' && !isFreshValue(asNodes(value.arguments)[0], state)) return false;
	return (
		copyingStatics.get(receiver.name)?.has(method) === true &&
		isGlobalReference(receiver, state)
	);
}

function isGlobalReference(identifier: AnyNode, state: WalkState): boolean {
	return (
		typeof identifier.start === 'number' &&
		resolvedSymbolAt(state.semantic(), identifier.start) === null
	);
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
