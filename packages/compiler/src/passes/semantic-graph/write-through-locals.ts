import { asNodes, isNode, unwrapTypeAssertion, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
	splitStaticGraphPath,
} from '../../artifact-helpers/graph-paths.ts';
import type { SemanticWriteThrough } from '../../artifacts.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import type { ModuleSemantics } from './shared-ast.ts';
import type { WalkState } from './types.ts';

type Binding = ModuleSemantics['bindings'][number];

/** What a local declared inside a handler, callback or attach body holds. */
type LocalOrigin =
	| { readonly kind: 'plain' }
	| { readonly kind: 'path'; readonly target: string }
	| {
			readonly kind: 'element';
			readonly anchor: string;
			readonly collection: string;
			readonly itemPath: ReadonlyArray<string>;
	  }
	| { readonly kind: 'untracked'; readonly reason: UntrackedReason; readonly source: string }
	// A new array or object whose members may still be state objects.
	| { readonly kind: 'container'; readonly source: string };

type UntrackedReason = Extract<SemanticWriteThrough, { readonly kind: 'untracked' }>['reason'];

// Array methods that hand each element, by reference, to the callback's first parameter.
const ELEMENT_CALLBACK_METHODS = new Set([
	'every',
	'filter',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flatMap',
	'forEach',
	'map',
	'some',
]);
// Array methods that return one element of the array, by reference.
const ELEMENT_RETURNING_METHODS = new Set(['at', 'find', 'findLast']);
// Array methods that return a new array holding the same element references.
const COPYING_METHODS = new Set([
	'concat',
	'filter',
	'flat',
	'slice',
	'toReversed',
	'toSorted',
	'toSpliced',
	'with',
]);

// Decided by the binding the root resolves to; undefined leaves component-scoped and module names to the name-based rules.
export function writeThroughLocal(
	target: AnyNode,
	state: WalkState,
	operation: 'assign' | 'update' | 'call' | 'delete',
): SemanticWriteThrough | undefined {
	if (state.currentSharedDefinitionId || !state.currentComponentName) return undefined;
	const root = rootIdentifier(target);
	if (!root) return undefined;

	const semantic = state.semantic();
	const binding = bindingAt(semantic, root.start as number);
	if (!binding || !isNestedFunctionLocal(binding, state)) return undefined;

	const origin = originOfBinding(binding, state, new Set());
	const segments = staticMemberSegments(target, state.source);
	if (origin.kind === 'plain') return { kind: 'local', local: binding.name };
	if (origin.kind === 'container') {
		const ownMember = (segments?.length ?? 0) <= (operation === 'call' ? 0 : 1);
		if (ownMember) return { kind: 'local', local: binding.name };
		return { kind: 'untracked', local: binding.name, reason: 'copy', source: origin.source };
	}
	if (origin.kind === 'untracked') {
		return {
			kind: 'untracked',
			local: binding.name,
			reason: origin.reason,
			source: origin.source,
		};
	}
	if (!segments) {
		return {
			kind: 'untracked',
			local: binding.name,
			reason: 'dynamic-key',
			source: expressionSource(target, state.source),
		};
	}
	if (origin.kind === 'path') {
		return { kind: 'path', local: binding.name, target: origin.target, path: segments };
	}
	return {
		kind: 'element',
		local: origin.anchor,
		collection: origin.collection,
		path: [...origin.itemPath, ...segments],
	};
}

function rootIdentifier(target: AnyNode): AnyNode | null {
	let cursor: AnyNode | undefined = target;
	while (cursor) {
		if (cursor.type === 'Identifier') return typeof cursor.start === 'number' ? cursor : null;
		if (cursor.type === 'MemberExpression') cursor = cursor.object as AnyNode | undefined;
		else if (cursor.type === 'ChainExpression')
			cursor = cursor.expression as AnyNode | undefined;
		else {
			const unwrapped = unwrapTypeAssertion(cursor);
			if (unwrapped === cursor) return null;
			cursor = unwrapped;
		}
	}
	return null;
}

// The property names after the root, or null when one of them is computed at runtime.
function staticMemberSegments(target: AnyNode, source: string): string[] | null {
	const segments: string[] = [];
	let cursor: AnyNode | undefined = target;
	while (cursor && cursor.type !== 'Identifier') {
		if (cursor.type === 'MemberExpression') {
			const key = staticMemberKey(cursor, source);
			if (key === null) return null;
			segments.unshift(key);
			cursor = cursor.object as AnyNode | undefined;
		} else if (cursor.type === 'ChainExpression') {
			cursor = cursor.expression as AnyNode | undefined;
		} else {
			const unwrapped = unwrapTypeAssertion(cursor);
			if (unwrapped === cursor) return null;
			cursor = unwrapped;
		}
	}
	return segments;
}

function staticMemberKey(member: AnyNode, source: string): string | null {
	const property = member.property as AnyNode | undefined;
	if (!property) return null;
	if (member.computed !== true) return typeof property.name === 'string' ? property.name : null;
	if (
		property.type === 'Literal' &&
		(typeof property.value === 'string' || typeof property.value === 'number')
	) {
		return String(property.value);
	}
	const text = expressionSource(property, source);
	return /^\d+$/.test(text) ? text : null;
}

function bindingAt(semantic: ModuleSemantics, offset: number): Binding | null {
	const symbolId = resolvedSymbolAt(semantic, offset);
	return symbolId === null ? null : (semantic.bindings[symbolId] ?? null);
}

// A handler, attach body or callback local: declared in a function nested inside a component.
function isNestedFunctionLocal(binding: Binding, state: WalkState): boolean {
	let innermost = true;
	for (const scope of binding.scope.ancestors()) {
		if (scope.kind !== 'function') continue;
		const component = isComponentFunction(scope.node as unknown as AnyNode);
		if (innermost) {
			if (component) return false;
			innermost = false;
			continue;
		}
		if (component) return !isRecordedAlias(binding, state);
	}
	return false;
}

function isComponentFunction(node: AnyNode): boolean {
	return (node.body as AnyNode | undefined)?.type === 'JSXCodeBlock';
}

// A destructured alias recorded for this very declaration already resolves through the graph.
function isRecordedAlias(binding: Binding, state: WalkState): boolean {
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	const start = declaration?.start;
	return state.graph.aliases.some(
		(alias) => alias.name === binding.name && alias.sourceSpan?.start === start,
	);
}

function originOfBinding(binding: Binding, state: WalkState, seen: Set<number>): LocalOrigin {
	if (seen.has(binding.id)) return { kind: 'plain' };
	seen.add(binding.id);
	const semantic = state.semantic();
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	if (!declaration) return { kind: 'plain' };
	const parent = semantic.parentOf(declaration as never) as unknown as AnyNode | null;
	if (!parent) return { kind: 'plain' };
	if (PATTERN_NODES.has(parent.type ?? ''))
		return destructuredOrigin(parent, binding, state, seen);

	if (parent.type === 'VariableDeclarator' && parent.id === declaration) {
		const init = parent.init as AnyNode | undefined;
		const declarationNode = semantic.parentOf(parent as never) as unknown as AnyNode | null;
		const loop =
			declarationNode &&
			(semantic.parentOf(declarationNode as never) as unknown as AnyNode | null);
		if (
			loop &&
			(loop.type === 'ForOfStatement' || loop.type === 'ForInStatement') &&
			loop.left === declarationNode
		) {
			if (loop.type === 'ForInStatement') return { kind: 'plain' };
			return elementOrigin(loop.right as AnyNode | undefined, binding, state, seen);
		}
		if (!init) return { kind: 'plain' };
		const origin = originOfExpression(init, state, seen);
		if (origin.kind === 'plain') return storedStateOrigin(binding, state, seen);
		if (origin.kind !== 'container' && isReassigned(binding)) {
			return { kind: 'untracked', reason: 'reassigned', source: binding.name };
		}
		if (origin.kind === 'element' && origin.anchor === '') {
			return { ...origin, anchor: binding.name };
		}
		return origin;
	}

	if (isFunctionNode(parent)) {
		const params = asNodes(parent.params);
		const index = params.indexOf(declaration);
		const call = semantic.parentOf(parent as never) as unknown as AnyNode | null;
		if (index < 0 || call?.type !== 'CallExpression') return { kind: 'plain' };
		if (asNodes(call.arguments)[0] !== parent) return { kind: 'plain' };
		const callee = unwrapTypeAssertion(call.callee as AnyNode | undefined);
		if (callee?.type !== 'MemberExpression' || callee.computed === true)
			return { kind: 'plain' };
		const method = (callee.property as AnyNode | undefined)?.name;
		const elementIndex = method === 'reduce' || method === 'reduceRight' ? 1 : 0;
		if (typeof method !== 'string' || index !== elementIndex) return { kind: 'plain' };
		if (!ELEMENT_CALLBACK_METHODS.has(method) && elementIndex === 0) return { kind: 'plain' };
		return elementOrigin(callee.object as AnyNode | undefined, binding, state, seen);
	}

	return { kind: 'plain' };
}

const PATTERN_NODES = new Set([
	'ArrayPattern',
	'AssignmentPattern',
	'ObjectPattern',
	'Property',
	'RestElement',
]);

// A name destructured out of state holds a piece of it no write-through path follows.
function destructuredOrigin(
	pattern: AnyNode,
	binding: Binding,
	state: WalkState,
	seen: Set<number>,
): LocalOrigin {
	const semantic = state.semantic();
	let cursor: AnyNode | null = pattern;
	let child: AnyNode = pattern;
	while (cursor && PATTERN_NODES.has(cursor.type ?? '')) {
		child = cursor;
		cursor = semantic.parentOf(cursor as never) as unknown as AnyNode | null;
	}
	if (!cursor) return { kind: 'plain' };
	let holder: LocalOrigin = { kind: 'plain' };
	if (cursor.type === 'VariableDeclarator' && cursor.id === child) {
		const declarationNode = semantic.parentOf(cursor as never) as unknown as AnyNode | null;
		const loop =
			declarationNode &&
			(semantic.parentOf(declarationNode as never) as unknown as AnyNode | null);
		if (loop?.type === 'ForOfStatement' && loop.left === declarationNode) {
			holder = elementOrigin(loop.right as AnyNode | undefined, binding, state, seen);
		} else if (cursor.init) {
			holder = originOfExpression(cursor.init as AnyNode, state, seen);
		}
	} else if (isFunctionNode(cursor)) {
		const params = asNodes(cursor.params);
		const index = params.indexOf(child);
		const call = semantic.parentOf(cursor as never) as unknown as AnyNode | null;
		const callee =
			call?.type === 'CallExpression'
				? unwrapTypeAssertion(call.callee as AnyNode | undefined)
				: undefined;
		const method =
			callee?.type === 'MemberExpression'
				? (callee.property as AnyNode | undefined)?.name
				: undefined;
		if (
			index === 0 &&
			asNodes(call?.arguments)[0] === cursor &&
			typeof method === 'string' &&
			ELEMENT_CALLBACK_METHODS.has(method)
		) {
			holder = elementOrigin(callee!.object as AnyNode | undefined, binding, state, seen);
		}
	}
	if (holder.kind === 'plain') return holder;
	return { kind: 'untracked', reason: 'destructured', source: originSource(holder) };
}

const STORING_METHODS = new Set(['push', 'unshift', 'splice', 'set', 'add', 'fill']);

// A local array, Map or object that later has a state object put into it holds state from then on.
function storedStateOrigin(binding: Binding, state: WalkState, seen: Set<number>): LocalOrigin {
	const semantic = state.semantic();
	for (const reference of binding.references) {
		const member = semantic.parentOf(reference.node as never) as unknown as AnyNode | null;
		if (member?.type !== 'MemberExpression' || member.object !== reference.node) continue;
		const outer = semantic.parentOf(member as never) as unknown as AnyNode | null;
		const method =
			member.computed === true ? null : (member.property as AnyNode | undefined)?.name;
		const stored =
			outer?.type === 'CallExpression' &&
			outer.callee === member &&
			typeof method === 'string' &&
			STORING_METHODS.has(method)
				? asNodes(outer.arguments)
				: outer?.type === 'AssignmentExpression' && outer.left === member
					? [outer.right as AnyNode]
					: [];
		for (const value of stored) {
			const origin = originOfExpression(
				value.type === 'SpreadElement' ? (value.argument as AnyNode) : value,
				state,
				seen,
			);
			if (origin.kind !== 'plain') return { kind: 'container', source: originSource(origin) };
		}
	}
	return { kind: 'plain' };
}

function originSource(origin: Exclude<LocalOrigin, { readonly kind: 'plain' }>): string {
	if (origin.kind === 'path') return origin.target;
	if (origin.kind === 'element') return origin.collection;
	return origin.source;
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

function isReassigned(binding: Binding): boolean {
	return binding.references.some((reference) => reference.isWrite);
}

// The local holds one element of the collection `collectionNode` evaluates to.
function elementOrigin(
	collectionNode: AnyNode | undefined,
	binding: Binding,
	state: WalkState,
	seen: Set<number>,
): LocalOrigin {
	if (!collectionNode) return { kind: 'plain' };
	const collection = originOfExpression(collectionNode, state, seen);
	if (collection.kind === 'plain') return collection;
	if (collection.kind === 'untracked') return collection;
	if (collection.kind === 'container') {
		return { kind: 'untracked', reason: 'copy', source: collection.source };
	}
	if (collection.kind === 'element') {
		return {
			kind: 'untracked',
			reason: 'nested-element',
			source: expressionSource(collectionNode, state.source),
		};
	}
	if (isMapOrSetPath(collection.target, state)) {
		return { kind: 'untracked', reason: 'map-entry', source: collection.target };
	}
	return { kind: 'element', anchor: binding.name, collection: collection.target, itemPath: [] };
}

function originOfExpression(node: AnyNode, state: WalkState, seen: Set<number>): LocalOrigin {
	const expression = unwrapExpression(node);
	if (!expression) return { kind: 'plain' };

	if (expression.type === 'Identifier' || expression.type === 'MemberExpression') {
		const member = memberOrigin(expression, state, seen);
		if (member) return member;
	}

	if (expression.type === 'CallExpression') {
		const callee = unwrapExpression(expression.callee as AnyNode | undefined);
		if (callee?.type === 'MemberExpression' && callee.computed !== true) {
			const method = (callee.property as AnyNode | undefined)?.name;
			const receiver = callee.object as AnyNode | undefined;
			if (typeof method === 'string' && receiver) {
				const owner = originOfExpression(receiver, state, seen);
				if (owner.kind === 'path') {
					const keyed = isMapOrSetPath(owner.target, state);
					if (
						keyed &&
						(method === 'get' || method === 'values' || method === 'entries')
					) {
						return { kind: 'untracked', reason: 'map-entry', source: owner.target };
					}
					if (!keyed && ELEMENT_RETURNING_METHODS.has(method)) {
						return {
							kind: 'element',
							anchor: '',
							collection: owner.target,
							itemPath: [],
						};
					}
					if (!keyed && method === 'values') return owner;
					if (COPYING_METHODS.has(method) || method === 'entries') {
						return { kind: 'container', source: owner.target };
					}
				}
				if (owner.kind !== 'plain' && owner.kind !== 'path') {
					if (ELEMENT_RETURNING_METHODS.has(method)) {
						return {
							kind: 'untracked',
							reason:
								owner.kind === 'untracked'
									? owner.reason
									: owner.kind === 'container'
										? 'copy'
										: 'nested-element',
							source: originSource(owner),
						};
					}
					if (COPYING_METHODS.has(method))
						return { kind: 'container', source: originSource(owner) };
				}
			}
		}
		return { kind: 'plain' };
	}

	if (expression.type === 'ArrayExpression' || expression.type === 'ObjectExpression') {
		const members =
			expression.type === 'ArrayExpression'
				? asNodes(expression.elements)
				: asNodes(expression.properties).map((property) =>
						property.type === 'Property' ? (property.value as AnyNode) : property,
					);
		for (const member of members) {
			const value = member.type === 'SpreadElement' ? (member.argument as AnyNode) : member;
			if (!isNode(value)) continue;
			const origin = originOfExpression(value, state, seen);
			if (origin.kind !== 'plain') return { kind: 'container', source: originSource(origin) };
		}
		return { kind: 'plain' };
	}

	if (expression.type === 'LogicalExpression' || expression.type === 'ConditionalExpression') {
		const branches =
			expression.type === 'LogicalExpression'
				? [expression.left, expression.right]
				: [expression.consequent, expression.alternate];
		for (const branch of branches) {
			if (!isNode(branch)) continue;
			const origin = originOfExpression(branch, state, seen);
			if (origin.kind !== 'plain') {
				return {
					kind: 'untracked',
					reason: 'conditional',
					source: expressionSource(expression, state.source),
				};
			}
		}
	}

	return { kind: 'plain' };
}

function unwrapExpression(node: AnyNode | undefined): AnyNode | undefined {
	let current = node;
	for (;;) {
		const unwrapped = unwrapTypeAssertion(current);
		if (unwrapped?.type === 'ChainExpression') {
			current = unwrapped.expression as AnyNode | undefined;
			continue;
		}
		return unwrapped;
	}
}

// `user.profile`, `rows[i]`, `p.tags`, `r.items` - a name, then member steps.
function memberOrigin(node: AnyNode, state: WalkState, seen: Set<number>): LocalOrigin | null {
	const root = rootIdentifier(node);
	if (!root) return null;
	const semantic = state.semantic();
	const binding = bindingAt(semantic, root.start as number);
	const segments = staticMemberSegments(node, state.source);

	if (binding && isNestedFunctionLocal(binding, state)) {
		const base = originOfBinding(binding, state, seen);
		if (base.kind === 'plain' || base.kind === 'untracked') return base;
		if (base.kind === 'container') {
			return segments?.length === 0
				? base
				: { kind: 'untracked', reason: 'copy', source: base.source };
		}
		if (!segments) {
			return dynamicElement(node, base, state, seen);
		}
		if (base.kind === 'path') {
			return { kind: 'path', target: [base.target, ...segments].reduce(appendSegment) };
		}
		return {
			...base,
			anchor: base.anchor || binding.name,
			itemPath: [...base.itemPath, ...segments],
		};
	}

	if (binding && isRowItem(binding, state)) {
		return { kind: 'untracked', reason: 'row-item', source: binding.name };
	}
	const text = expressionSource(node, state.source);
	if (segments) {
		return resolvesToGraph(text, state) ? { kind: 'path', target: text } : null;
	}
	return dynamicElement(node, null, state, seen);
}

// `rows[i]` - the element of a state collection read under a key known only at runtime.
function dynamicElement(
	node: AnyNode,
	base: LocalOrigin | null,
	state: WalkState,
	seen: Set<number>,
): LocalOrigin | null {
	if (node.type !== 'MemberExpression' || node.computed !== true) {
		return base
			? {
					kind: 'untracked',
					reason: 'dynamic-key',
					source: expressionSource(node, state.source),
				}
			: null;
	}
	const object = node.object as AnyNode | undefined;
	if (!object) return null;
	const owner = originOfExpression(object, state, seen);
	if (owner.kind === 'plain') return null;
	if (owner.kind === 'path' && !isMapOrSetPath(owner.target, state)) {
		return {
			kind: 'untracked',
			reason: 'dynamic-key',
			source: expressionSource(node, state.source),
		};
	}
	return {
		kind: 'untracked',
		reason: 'dynamic-key',
		source: expressionSource(node, state.source),
	};
}

// The item a keyed @for row renders: a write through it lowers only under its own name.
function isRowItem(binding: Binding, state: WalkState): boolean {
	const declaration = binding.declarations[0] as unknown as AnyNode | undefined;
	if (typeof declaration?.start !== 'number') return false;
	for (const span of state.keyedRepeatItemSpans.values()) {
		if (declaration.start >= span.start && (declaration.end as number) <= span.end) return true;
	}
	return false;
}

function appendSegment(base: string, segment: string): string {
	return /^[A-Za-z_$][\w$]*$/.test(segment)
		? `${base}.${segment}`
		: `${base}[${JSON.stringify(segment)}]`;
}

function resolvesToGraph(text: string, state: WalkState): boolean {
	const scope = state.currentSharedDefinitionId ?? null;
	const resolved = resolveGraphPath(
		text,
		graphBindingMap(state.graph, scope),
		semanticAliasMap(state.graph, scope),
	);
	return !!resolved && resolved.binding.kind !== 'element';
}

function isMapOrSetPath(target: string, state: WalkState): boolean {
	const segments = splitStaticGraphPath(target);
	if (segments.length !== 1) return false;
	const binding = graphBindingMap(state.graph, state.currentSharedDefinitionId ?? null).get(
		segments[0]!,
	);
	const initializer = binding?.initializerSource?.trim() ?? '';
	return /^new\s+(Map|Set|WeakMap|WeakSet)\b/.test(initializer);
}
