import { getIdentifierName, unwrapTypeAssertion, walkNode, type AnyNode } from '../../ast/nodes.ts';
import { expressionSource } from '../../ast/source.ts';
import { resolvedSymbolAt } from './collect-expressions.ts';
import { ownedModuleAst } from './shared-ast.ts';
import {
	firstDetachedSyncPolicyReference,
	hasSyncEventPolicyCandidate,
} from './collect-sync-policy.ts';
import type { WalkState } from './types.ts';

/** Why a handler named by a body local has no browser route, and the rewrite that has one. */
export type UnroutableHandler = { readonly why: string; readonly rewrite: string };

/**
 * What a component-body local named as a handler holds: a function reached through
 * any `const` aliases, the visible function a factory call returns, or why neither is
 * knowable. Null for a name that is not a body local or holds some other value.
 */
export type NamedHandler =
	| { readonly kind: 'function'; readonly node: AnyNode }
	| { readonly kind: 'factory'; readonly returned: AnyNode }
	| ({ readonly kind: 'unroutable' } & UnroutableHandler);

export function namedHandler(node: AnyNode, state: WalkState, label: string): NamedHandler | null {
	return resolveNamed(node, state, label, new Set());
}

function resolveNamed(
	node: AnyNode,
	state: WalkState,
	label: string,
	seen: Set<number>,
): NamedHandler | null {
	const name = node.type === 'Identifier' ? getIdentifierName(node) : null;
	const local = name ? bodyLocal(node, state) : null;
	if (!name || !local || seen.has(local.start)) return null;
	seen.add(local.start);
	if (local.writes > 1 && (!local.init || isFunctionNode(local.init)))
		return {
			kind: 'unroutable',
			why: `\`${name}\` is a \`let\` the component body reassigns, so the function it holds depends on statements that run only during the initial render; the browser has no single definition to rebuild it from.`,
			rewrite: `Declare each function as its own const and choose between them where the event runs: ${label}={(event) => (condition ? first(event) : second(event))}.`,
		};
	const init = local.init;
	if (!init || local.writes > 1) return null;
	if (isFunctionNode(init)) return { kind: 'function', node: init };
	if (init.type === 'Identifier') return resolveNamed(init, state, label, seen);
	if (init.type !== 'CallExpression') return null;

	const callee = unwrapTypeAssertion(init.callee as AnyNode | undefined);
	const calleeSource = callee ? expressionSource(callee, state.source) : null;
	const factory = callee ? calledFunction(callee, state) : null;
	const returned = factory ? returnedFunction(factory) : null;
	if (
		returned &&
		(hasSyncEventPolicyCandidate(returned) || firstDetachedSyncPolicyReference(returned))
	)
		return {
			kind: 'unroutable',
			why: `\`${name}\` cancels the event inside the function \`${calleeSource}(…)\` returns. The browser has to cancel before the handler's code loads, and it only finds that cancel in a handler written inline or declared as a const function.`,
			rewrite: `Declare the handler as a const arrow in the component body, \`const ${name} = (event) => { event.preventDefault(); … }\`, or write it inline: ${label}={(event) => { event.preventDefault(); … }}.`,
		};
	if (returned) return { kind: 'factory', returned };
	const rewrite = `Write \`${name}\` as a const arrow in the component body that does the work itself, \`const ${name} = (event) => { … }\`, and keep anything it must remember between events in state().`;
	return {
		kind: 'unroutable',
		why: factory
			? `\`${name}\` is what \`${calleeSource}(…)\` returns, and \`${calleeSource}\` does more than return a function. The browser rebuilds \`${name}\` from its definition each time the event runs, so that work would run again on every event.`
			: `\`${name}\` is what \`${calleeSource ?? 'a call'}(…)\` returns, and that function is not declared in this file, so the compiler cannot see the function it returns.`,
		rewrite,
	};
}

type BodyLocal = { readonly start: number; readonly writes: number; readonly init: AnyNode | null };

function bodyLocal(node: AnyNode, state: WalkState): BodyLocal | null {
	if (typeof node.start !== 'number' || typeof node.end !== 'number') return null;
	const bindingId = state.resolvedComponentLocalBindingsBySpan.get(`${node.start}:${node.end}`);
	const declaration = bindingId ? state.componentLocalBindings.get(bindingId)?.declaration : null;
	const start = declaration?.declarationSpan?.start;
	if (!declaration || typeof start !== 'number') return null;
	return {
		start,
		writes: declaration.writeCount ?? 0,
		init: declaredFunctionOrInit(start, state),
	};
}

// The function a call names: a body local through its aliases, or a function declared at module scope in this file.
function calledFunction(callee: AnyNode, state: WalkState): AnyNode | null {
	const local = resolveNamed(callee, state, '', new Set());
	if (local?.kind === 'function') return local.node;
	if (local || callee.type !== 'Identifier' || typeof callee.start !== 'number') return null;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, callee.start);
	const binding = symbolId === null ? null : semantic.bindings[symbolId];
	if (!binding || binding.scope.kind !== 'module' || binding.declarations.length !== 1)
		return null;
	const init = declaredFunctionOrInit(binding.declarations[0]!.start, state, true);
	return init && isFunctionNode(init) ? init : null;
}

function declaredFunctionOrInit(
	declarationStart: number,
	state: WalkState,
	constOnly = false,
): AnyNode | null {
	let found: AnyNode | null = null;
	walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
		if (found) return;
		if (candidate.type === 'FunctionDeclaration') {
			if ((candidate.id as AnyNode | undefined)?.start === declarationStart)
				found = candidate;
			return;
		}
		if (candidate.type !== 'VariableDeclaration') return;
		if (constOnly && candidate.kind !== 'const') return;
		for (const declarator of (candidate.declarations as AnyNode[] | undefined) ?? [])
			if ((declarator.id as AnyNode | undefined)?.start === declarationStart)
				found = unwrapTypeAssertion(declarator.init as AnyNode | undefined) ?? null;
	});
	return found;
}

// A factory whose only work is returning a function: rebuilding it per event cannot lose state it kept.
function returnedFunction(factory: AnyNode): AnyNode | null {
	if (factory.async === true || factory.generator === true) return null;
	const body = factory.body as AnyNode | undefined;
	if (!body) return null;
	if (body.type !== 'BlockStatement') {
		const value = unwrapTypeAssertion(body);
		return value && isFunctionNode(value) ? value : null;
	}
	const statements = (body.body as AnyNode[] | undefined) ?? [];
	const last = statements.at(-1);
	if (statements.length !== 1 || last?.type !== 'ReturnStatement') return null;
	const value = unwrapTypeAssertion(last.argument as AnyNode | undefined);
	return value && isFunctionNode(value) ? value : null;
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}
