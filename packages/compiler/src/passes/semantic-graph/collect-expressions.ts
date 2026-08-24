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
import { getFrameworkApiForCall } from './imports.ts';
import type { SemanticView } from 'yuku-tsrx';
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

/**
 * The writes a function nested inside a write's VALUE performs when it runs.
 *
 * `s.timer = window.setInterval(() => { s.count = s.count + 1; }, 50)` is two
 * writes, not one: the handle now, and the counter on every tick. The generic
 * walk stops at an assignment - it takes the write and hands the value to the
 * read collector - so the tick's write was recorded nowhere. Emission then
 * matched the target's authored text against the reads that value collector HAD
 * recorded and emitted `context.graph.read(...) = ...`, which parses and throws
 * `Invalid left-hand side in assignment` on every tick.
 *
 * Only writes are collected. Reads in the value are already recorded by
 * `collectExpressionReads`, which descends into function bodies, so collecting
 * them here would double every one.
 *
 * The descent mirrors the generic walk's write rules rather than reusing it:
 * markup, elements and component sites inside a nested function body are not
 * collected today, and turning that on is a separate decision. A write this
 * walk still misses is not silent - the emission band leaves its target
 * authored, and the unresolved-reference guard fails the compile naming it.
 */
export function collectNestedFunctionWrites(
	value: AnyNode | undefined,
	state: WalkState,
): void {
	if (!value) return;

	if (isFunctionLikeNode(value)) {
		collectWritesIn(value.body as AnyNode | undefined, state);
		return;
	}

	// A derive's body is the one place a write is banned rather than lowered, and
	// the ban is decided by the generic walk's creation site, which this descent
	// does not maintain. Leaving it alone keeps the ban's owner single.
	if (getFrameworkApiForCall(value, state.frameworkApiImports) === 'computed') return;

	for (const child of childNodes(value)) collectNestedFunctionWrites(child, state);
}

/** The generic walk's write cases, applied inside a nested function body. */
function collectWritesIn(node: AnyNode | undefined, state: WalkState): void {
	if (!node) return;

	if (node.type === 'AssignmentExpression') {
		collectAssignment(node, state);
		collectNestedFunctionWrites(node.right as AnyNode | undefined, state);
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

	if (node.type === 'CallExpression') collectCollectionCall(node, state);

	for (const child of childNodes(node)) collectWritesIn(child, state);
}

function isFunctionLikeNode(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
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
		if (!namesABinding(node)) {
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
 * receiver that is itself a member path is a value. A binding that holds a
 * scalar is a value too: a string or a number declares no members of its own.
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

	return resolved?.binding.valueKind === 'scalar';
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
	for (let scopeId = 0; scopeId < semantic.scope.count; scopeId += 1) {
		if (semantic.scope.kind(scopeId) !== 'function') continue;
		const start = semantic.scope.start(scopeId);
		// yuku scope ranges use an exclusive end, so a scope ending exactly at
		// the node's start does not contain it.
		if (start > node.start || semantic.scope.end(scopeId) <= node.start) continue;
		if (!innermost || start > innermost.start) {
			innermost = { start, end: semantic.scope.end(scopeId) };
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

	const scopeId = semantic.symbol.scopeId(symbolId);
	return semantic.scope.start(scopeId) >= region.start && semantic.scope.end(scopeId) <= region.end;
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
const valueReferenceSymbolsByOffset = new WeakMap<SemanticView, Map<number, number>>();

/** The binding an identifier use at `offset` resolves to, if it resolves. */
export function resolvedSymbolAt(semantic: SemanticView, offset: number): number | null {
	let symbolsByOffset = valueReferenceSymbolsByOffset.get(semantic);
	if (!symbolsByOffset) {
		symbolsByOffset = new Map<number, number>();
		for (let referenceId = 0; referenceId < semantic.reference.count; referenceId += 1) {
			if (semantic.reference.inTypePosition(referenceId)) continue;
			const symbolId = semantic.reference.symbolId(referenceId);
			if (symbolId === null) continue;
			const start = semantic.reference.start(referenceId);
			if (!symbolsByOffset.has(start)) symbolsByOffset.set(start, symbolId);
		}
		valueReferenceSymbolsByOffset.set(semantic, symbolsByOffset);
	}

	return symbolsByOffset.get(offset) ?? null;
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
