import { PROTOCOL_PROP_GRAPH_NODE_PREFIX, PROTOCOL_PROPS_GRAPH_NODE_ID } from '@markless/serializer';
import {
	childNodes,
	getIdentifierName,
	unwrapTypeAssertion,
	walkNode,
	type AnyNode,
} from '../../ast/nodes.ts';
import { expressionSource, sourceSpan } from '../../ast/source.ts';
import type { SourceSpan } from '../../diagnostics.ts';
import {
	graphBindingMap,
	resolveGraphPath,
	semanticAliasMap,
} from '../../artifact-helpers/graph-paths.ts';
import { collectGraphDependencies } from './collect-async.ts';
import { isClassInstanceValue } from './collect-state.ts';
import { collectExpressionReads, resolvedSymbolAt } from './collect-expressions.ts';
import {
	isCompositeTemplateExpression,
	mintTemplateExpressionComputed,
	pureCompositeReadSources,
	type CompositeReadOptions,
} from './composite-reads.ts';
import {
	handlerReadsRenderLocalDiagnostic,
	handlerWritesRenderLocalDiagnostic,
} from './diagnostics.ts';
import { rebuiltLocalWrite } from './rebuilt-local-writes.ts';
import { findSharedInstance, resolveSharedInstanceGraphPath } from './collect-shared.ts';
import { repeatRowBindsName } from './collect-repeat.ts';
import { getCallName, getFrameworkApiForCall, isFrameworkApiName } from './imports.ts';
import { ownedModuleAst } from './shared-ast.ts';
import type { WalkState } from './types.ts';

/**
 * An expression that reads component-body locals, rewritten so it reads none: each
 * `const` local recomputable from module values, props, and graph reads is replaced by
 * its own defining expression. A browser symbol has no component body to find the
 * local in, so this is the only form of the expression it can run.
 */
export type RenderLocalInline =
	| {
			readonly kind: 'inlined';
			readonly source: string;
			// The defining expressions spliced in; their graph reads are the expression's too.
			readonly definitions: ReadonlyArray<AnyNode>;
	  }
	| { readonly kind: 'row-item'; readonly name: string }
	| { readonly kind: 'render-local'; readonly name: string }
	| {
			readonly kind: 'writes-render-local';
			readonly name: string;
			readonly write: string;
			readonly call: boolean;
	  };

type Replacement = { readonly start: number; readonly end: number; readonly text: string };

export function inlineRenderLocals(
	node: AnyNode,
	state: WalkState,
	// A function, class instance, or DOM node local is the capture pass's to refuse, by name.
	options: {
		readonly leaveCaptureOwned?: boolean;
		readonly leaveRowItems?: boolean;
		// A body function is spliced in as its own definition, as a `const` value is.
		readonly inlineFunctions?: boolean;
		// Only locals declared where this answers true are spliced; any other is left as written.
		readonly inlineOnly?: (declarationStart: number) => boolean;
	} = {},
): RenderLocalInline {
	const definitions: AnyNode[] = [];
	const result = inlineWithin(node, state, definitions, new Set(), {
		leaveCaptureOwned: options.leaveCaptureOwned === true,
		leaveRowItems: options.leaveRowItems === true,
		inlineFunctions: options.inlineFunctions === true,
		inlineOnly: options.inlineOnly,
	});
	return 'source' in result ? { kind: 'inlined', source: result.source, definitions } : result;
}

function inlineWithin(
	node: AnyNode,
	state: WalkState,
	definitions: AnyNode[],
	inlining: Set<number>,
	options: {
		readonly leaveCaptureOwned: boolean;
		readonly leaveRowItems: boolean;
		readonly inlineFunctions: boolean;
		readonly inlineOnly: ((declarationStart: number) => boolean) | undefined;
	},
):
	| { readonly source: string; readonly freeNames: ReadonlySet<string> }
	| Exclude<RenderLocalInline, { readonly kind: 'inlined' }> {
	const source = expressionSource(node, state.source);
	if (typeof node.start !== 'number' || typeof node.end !== 'number' || source === null)
		return { kind: 'render-local', name: source ?? '' };
	const region = { start: node.start, end: node.end };
	const semantic = state.semantic();
	const replacements: Replacement[] = [];
	const freeNames = new Set<string>();
	const splicedNames = new Set<string>();
	const boundInside = new Set<string>();
	let refusal: Exclude<RenderLocalInline, { readonly kind: 'inlined' }> | null = null;

	const ancestors: AnyNode[] = [];
	const visit = (candidate: AnyNode, parent: AnyNode | null): void => {
		if (refusal) return;
		if (candidate.type === 'Identifier' && typeof candidate.start === 'number') {
			const name = getIdentifierName(candidate);
			const symbolId = name ? resolvedSymbolAt(semantic, candidate.start) : null;
			if (name && symbolId !== null) {
				const scopeId = semantic.bindings[symbolId]!.scope.id;
				if (
					semantic.scopes[scopeId]!.node.start >= region.start &&
					semantic.scopes[scopeId]!.node.end <= region.end
				) {
					boundInside.add(name);
				} else if (repeatRowBindsName(name, state)) {
					if (options.leaveRowItems) freeNames.add(name);
					else refusal = { kind: 'row-item', name };
				} else if (
					semantic.scopes[scopeId]!.kind === 'module' ||
					readsGraph(name, state) ||
					(options.inlineOnly &&
						!options.inlineOnly(
							semantic.bindings[symbolId]!.declarations[0]?.start ?? -1,
						))
				) {
					freeNames.add(name);
				} else {
					const local = classifyLocal(symbolId, name, state, options.inlineFunctions);
					if (local.kind === 'definition' && local.named && inlining.has(symbolId)) {
						// A function declaration is spliced as a named function expression, which binds its own name.
					} else if (
						local.kind === 'graph' ||
						(local.kind === 'capture-owned' && options.leaveCaptureOwned) ||
						(local.kind === 'row-binding' && options.leaveRowItems)
					) {
						freeNames.add(name);
					} else if (local.kind === 'row-binding') {
						refusal = { kind: 'row-item', name };
					} else if (local.kind !== 'definition' || inlining.has(symbolId)) {
						refusal = { kind: 'render-local', name };
					} else if (
						options.inlineFunctions &&
						!isFunctionNode(local.init) &&
						rebuiltLocalWrite(candidate, ancestors, local.init, state.source)
					) {
						const write = rebuiltLocalWrite(candidate, ancestors, local.init, state.source)!;
						refusal = { kind: 'writes-render-local', name, write: write.source, call: write.call };
					} else {
						const definition = local.init;
						definitions.push(definition);
						const inner = inlineWithin(
							definition,
							state,
							definitions,
							new Set([...inlining, symbolId]),
							options,
						);
						if (!('source' in inner)) {
							refusal = inner;
						} else {
							for (const free of inner.freeNames) {
								freeNames.add(free);
								splicedNames.add(free);
							}
							const shorthand =
								parent?.type === 'Property' &&
								parent.shorthand === true &&
								parent.value === candidate;
							replacements.push({
								start: candidate.start,
								end:
									typeof candidate.end === 'number'
										? candidate.end
										: candidate.start + name.length,
								text: shorthand
									? `${name}: (${inner.source})`
									: `(${inner.source})`,
							});
						}
					}
				}
			}
		}
		// A shorthand property's key and value are one identifier; only the value reads it.
		ancestors.push(candidate);
		if (candidate.type === 'Property' && candidate.shorthand === true)
			visit(candidate.value as AnyNode, candidate);
		else for (const child of childNodes(candidate)) visit(child, candidate);
		ancestors.pop();
	};
	visit(node, null);
	if (refusal) return refusal;
	// A spliced definition must not have its names captured by a binding inside this expression.
	for (const name of splicedNames)
		if (boundInside.has(name)) return { kind: 'render-local', name };

	let text = source;
	for (const replacement of [...replacements].sort((left, right) => right.start - left.start))
		text =
			text.slice(0, replacement.start - region.start) +
			replacement.text +
			text.slice(replacement.end - region.start);
	return { source: text, freeNames };
}

// A row, an arm and a nested `@{ ... }` have no body of their own in the render, so a slot
// reading a `const` declared in one carries that const's definition instead.
export function inlineNestedTemplateLocals(node: AnyNode, state: WalkState): string | null {
	const scopes = nestedTemplateScopes(state);
	if (scopes.length === 0) return null;
	const inlined = inlineRenderLocals(node, state, {
		leaveCaptureOwned: true,
		leaveRowItems: true,
		inlineOnly: (start) => scopes.some((scope) => start >= scope.start && start < scope.end),
	});
	return inlined.kind === 'inlined' && inlined.definitions.length > 0 ? inlined.source : null;
}

type Span = { readonly start: number; readonly end: number };
const nestedTemplateScopeCache = new WeakMap<WalkState, ReadonlyArray<Span>>();

// Every control-flow body, and every `@{ ... }` written among template children rather than as a function body.
function nestedTemplateScopes(state: WalkState): ReadonlyArray<Span> {
	const cached = nestedTemplateScopeCache.get(state);
	if (cached) return cached;
	const spans: Span[] = [];
	const add = (node: AnyNode | undefined) => {
		if (typeof node?.start === 'number' && typeof node.end === 'number')
			spans.push({ start: node.start, end: node.end });
	};
	walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
		if (candidate.type === 'JSXForExpression') {
			add(candidate.body as AnyNode | undefined);
			add(candidate.empty as AnyNode | undefined);
		}
		if (candidate.type === 'JSXIfExpression') {
			add(candidate.consequent as AnyNode | undefined);
			add(candidate.alternate as AnyNode | undefined);
		}
		if (candidate.type === 'JSXSwitchExpression')
			for (const switchCase of (candidate.cases as AnyNode[] | undefined) ?? []) add(switchCase);
		if (candidate.type === 'JSXTryExpression') {
			add(candidate.block as AnyNode | undefined);
			add(candidate.pending as AnyNode | undefined);
			add((candidate.handler as AnyNode | undefined)?.body as AnyNode | undefined);
		}
		if (!Array.isArray(candidate.children)) return;
		for (const child of candidate.children as AnyNode[])
			if (child?.type === 'JSXCodeBlock') add(child);
	});
	nestedTemplateScopeCache.set(state, spans);
	return spans;
}

/**
 * A handler or callback runs as a browser symbol with no component body, so each body
 * local it reads is recomputed from its definition; any other local fails the build.
 */
export function inlineHandlerRenderLocals(
	node: AnyNode,
	state: WalkState,
	handlerLabel: string,
): { readonly source: string; readonly definitionSpans: ReadonlyArray<SourceSpan> } | null {
	if (state.currentSharedDefinitionId) return null;
	const inlined = inlineRenderLocals(node, state, {
		leaveCaptureOwned: true,
		leaveRowItems: true,
		inlineFunctions: true,
	});
	if (inlined.kind === 'writes-render-local') {
		state.graph.diagnostics.push(
			handlerWritesRenderLocalDiagnostic({
				handlerLabel,
				localName: inlined.name,
				write: inlined.write,
				call: inlined.call,
				handler: node,
				filename: state.filename,
			}),
		);
		return null;
	}
	if (inlined.kind !== 'inlined') {
		state.graph.diagnostics.push(
			handlerReadsRenderLocalDiagnostic({
				handlerLabel,
				localName: inlined.name,
				handler: node,
				filename: state.filename,
			}),
		);
		return null;
	}
	for (const definition of inlined.definitions) collectDefinitionReads(definition, state);
	return {
		source: inlined.source,
		definitionSpans: inlined.definitions.flatMap(
			(definition) => sourceSpan(definition, state.filename) ?? [],
		),
	};
}

// An expression combining graph reads with body consts derives from their definitions, so a write moves it.
export function liftRenderLocalComposite(
	expression: AnyNode,
	state: WalkState,
	options: CompositeReadOptions,
): { readonly graphNodeId: string } | null {
	if (state.currentKeyedRepeatScopeIds.length > 0 || state.currentSharedDefinitionId) return null;
	if (
		!isCompositeTemplateExpression(expression, options) &&
		!namesNestedTemplateLocal(expression, state)
	)
		return null;
	const readSources = pureCompositeReadSources(expression, state, options);
	if (!readSources) return null;
	const inlined = inlineRenderLocals(expression, state);
	if (inlined.kind !== 'inlined' || inlined.definitions.length === 0) return null;
	const sources = new Set(readSources.filter((source) => readsGraphRoot(source, state)));
	for (const definition of inlined.definitions)
		for (const dependency of collectGraphDependencies(definition, state))
			sources.add(dependency.source);
	const lifted = mintTemplateExpressionComputed(
		`() => ${inlined.source}`,
		[...sources],
		state,
	);
	if (lifted)
		for (const definition of new Set(inlined.definitions))
			collectDefinitionReads(definition, state);
	return lifted;
}

// A const written inside an arm, row or `@{ }` re-runs with every render of that block, so a plain read of it is live.
function namesNestedTemplateLocal(expression: AnyNode, state: WalkState): boolean {
	let root = expression;
	while (root.type === 'MemberExpression' && root.computed !== true) root = root.object as AnyNode;
	if (root.type !== 'Identifier' || typeof root.start !== 'number') return false;
	const semantic = state.semantic();
	const symbolId = resolvedSymbolAt(semantic, root.start);
	const declared = symbolId === null ? undefined : semantic.bindings[symbolId]!.declarations[0]?.start;
	return (
		declared !== undefined &&
		nestedTemplateScopes(state).some((scope) => declared >= scope.start && declared < scope.end)
	);
}

function readsGraphRoot(source: string, state: WalkState): boolean {
	const root = /^[^.?[(\s]+/.exec(source)?.[0];
	return Boolean(root && readsGraph(root, state));
}

// A flipped arm rebuilds from graph reads alone, so a body const it shows rides a computed of its definition.
/** The same lift for a value markup shows, which also takes a props-only composite: a flip rebuilds the arm from graph reads alone. */
export const liftArmShownValue = (expression: AnyNode, state: WalkState) =>
	liftArmRenderLocalValue(expression, state, true);

export function liftArmRenderLocalValue(
	expression: AnyNode,
	state: WalkState,
	propsOnly = false,
): { readonly graphNodeId: string } | null {
	if (
		!state.currentArmScope ||
		state.currentKeyedRepeatScopeIds.length > 0 ||
		state.currentSharedDefinitionId
	)
		return null;
	const inlined = inlineRenderLocals(expression, state);
	if (inlined.kind !== 'inlined') return null;
	// A plain read already resolves to its graph node; a props-only composite has no other route a flip can rebuild from.
	if (
		inlined.definitions.length === 0 &&
		(!propsOnly ||
			expression.type === 'Identifier' ||
			expression.type === 'MemberExpression' ||
			collectGraphDependencies(expression, state).length === 0)
	)
		return null;
	const guard = armGuardCondition(state);
	if (!guard) return null;
	const definitions = [...guard.definitions, ...inlined.definitions];
	const dependencies = [expression, ...guard.nodes, ...definitions].flatMap((node) =>
		collectGraphDependencies(node, state),
	);
	const asyncNodeIds = new Set(
		state.graph.graphBindings.flatMap((binding) => (binding.asyncCapable ? [binding.id] : [])),
	);
	if (dependencies.some((dependency) => asyncNodeIds.has(dependency.graphNodeId))) return null;
	// Nothing the browser can change decides the arm or its value, so the server's render of it stands.
	if (dependencies.length > 0 && dependencies.every((dependency) => readsServerOnlyProp(dependency, state)))
		return null;
	const lifted = mintTemplateExpressionComputed(
		guard.source === null
			? `() => ${inlined.source}`
			: `() => (${guard.source}) ? ${inlined.source} : undefined`,
		[...new Set(dependencies.map((dependency) => dependency.source))],
		state,
		undefined,
		true,
	);
	if (lifted)
		for (const definition of new Set(definitions)) collectDefinitionReads(definition, state);
	return lifted;
}

// The enclosing arms' conditions with body locals inlined, so a lifted value is only computed where its arm renders.
function armGuardCondition(state: WalkState): {
	readonly source: string | null;
	readonly nodes: ReadonlyArray<AnyNode>;
	readonly definitions: ReadonlyArray<AnyNode>;
} | null {
	const nodes: AnyNode[] = [];
	const definitions: AnyNode[] = [];
	const inline = (node: AnyNode): string | null => {
		const inlined = inlineRenderLocals(node, state);
		if (inlined.kind !== 'inlined') return null;
		nodes.push(node);
		definitions.push(...inlined.definitions);
		return `(${inlined.source})`;
	};
	const conditions: string[] = [];
	for (const guard of state.currentArmGuards) {
		if (guard.kind === 'if') {
			const test = inline(guard.test);
			if (test === null) return null;
			conditions.push(guard.holds ? test : `!${test}`);
			continue;
		}
		const discriminant = inline(guard.discriminant);
		if (discriminant === null) return null;
		const tests = guard.kind === 'case' ? [guard.test] : guard.tests;
		const matches: string[] = [];
		for (const test of tests) {
			const source = inline(test);
			if (source === null) return null;
			matches.push(`${discriminant} === ${source}`);
		}
		if (guard.kind === 'case') conditions.push(matches[0]!);
		else if (matches.length > 0) conditions.push(`!(${matches.join(' || ')})`);
	}
	return { source: conditions.length > 0 ? conditions.join(' && ') : null, nodes, definitions };
}

// The spliced definition's reads are lowered at its own span, once however many handlers splice it.
export function collectDefinitionReads(definition: AnyNode, state: WalkState): void {
	const reads = state.graph.stateReads;
	const known = new Set(reads.map(readKey));
	const before = reads.length;
	collectExpressionReads(definition, state);
	const added = reads.splice(before).filter((read) => !known.has(readKey(read)));
	reads.push(...added);
}

function readKey(read: { readonly source: string; readonly sourceSpan?: SourceSpan }): string {
	return `${read.source}@${read.sourceSpan?.start ?? ''}:${read.sourceSpan?.end ?? ''}`;
}

function readsGraph(name: string, state: WalkState): boolean {
	return Boolean(
		resolveGraphPath(
			name,
			graphBindingMap(state.graph, state.currentSharedDefinitionId),
			semanticAliasMap(state.graph, state.currentSharedDefinitionId),
		) ??
		resolveSharedInstanceGraphPath(name, state.graph, state.currentComponentName) ??
		findSharedInstance(name, state.graph, state.currentComponentName),
	);
}

type LocalKind =
	| { readonly kind: 'graph' | 'capture-owned' | 'row-binding' | 'opaque' }
	| { readonly kind: 'definition'; readonly init: AnyNode; readonly named?: boolean };

// What a component-body local is, from its declaration: a graph cell declared later in the
// body, a value the capture pass owns, a @for row binding, a `const` definition to recompute,
// or none of these.
function classifyLocal(
	symbolId: number,
	name: string,
	state: WalkState,
	inlineFunctions = false,
): LocalKind {
	const semantic = state.semantic();
	if (semantic.bindings[symbolId]!.declarations.length !== 1) return { kind: 'opaque' };
	const declared = classifyDeclaration(symbolId, state, inlineFunctions);
	if (declared.kind === 'definition' && isFunctionNode(declared.init)) return declared;
	if (state.graph.localBindings.some((binding) => binding.name === name))
		return { kind: 'capture-owned' };
	return declared;
}

function isFunctionNode(node: AnyNode): boolean {
	return (
		node.type === 'FunctionDeclaration' ||
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression'
	);
}

function classifyDeclaration(
	symbolId: number,
	state: WalkState,
	inlineFunctions: boolean,
): LocalKind {
	const semantic = state.semantic();
	const declarationStart = semantic.bindings[symbolId]!.declarations[0]!.start;
	let found: LocalKind | null = null;
	walkNode(ownedModuleAst(state, state.source, state.filename), (candidate) => {
		if (found) return;
		if (candidate.type === 'JSXForExpression') {
			if (
				declaredIn(candidate.left, declarationStart) ||
				declaredIn(candidate.index, declarationStart)
			)
				found = { kind: 'row-binding' };
			return;
		}
		if (candidate.type === 'FunctionDeclaration') {
			if ((candidate.id as AnyNode | undefined)?.start === declarationStart)
				found = inlineFunctions
					? { kind: 'definition', init: candidate, named: true }
					: { kind: 'capture-owned' };
			return;
		}
		if (candidate.type !== 'VariableDeclaration') return;
		for (const declarator of (candidate.declarations as AnyNode[] | undefined) ?? []) {
			const id = declarator.id as AnyNode | undefined;
			if (id?.start !== declarationStart) continue;
			const init = unwrapTypeAssertion(declarator.init as AnyNode | undefined);
			found =
				id.type !== 'Identifier' || !init
					? { kind: 'opaque' }
					: callsFrameworkApi(init, state)
						? { kind: 'graph' }
						: inlineFunctions && candidate.kind === 'const' && isFunctionNode(init)
							? { kind: 'definition', init }
							: init.type === 'ArrowFunctionExpression' ||
								  init.type === 'FunctionExpression' ||
								  isClassInstanceValue(init)
								? { kind: 'capture-owned' }
							: candidate.kind === 'const'
								? { kind: 'definition', init: declarator.init as AnyNode }
								: { kind: 'opaque' };
		}
	});
	return found ?? { kind: 'opaque' };
}

function declaredIn(node: unknown, start: number): boolean {
	const header = node as AnyNode | undefined;
	return (
		typeof header?.start === 'number' &&
		typeof header.end === 'number' &&
		start >= header.start &&
		start < header.end
	);
}

// A framework call makes a graph cell or a handle, never a value to recompute; an unimported one is already an error.
function callsFrameworkApi(node: AnyNode, state: WalkState): boolean {
	if (getFrameworkApiForCall(node, state.frameworkApiImports)) return true;
	const name = node.type === 'CallExpression' ? getCallName(node) : null;
	return Boolean(
		name &&
		(isFrameworkApiName(name) ||
			state.graph.sharedDefinitions.some((definition) => definition.name === name)),
	);
}

function readsServerOnlyProp(
	dependency: { readonly graphNodeId: string; readonly path: ReadonlyArray<string> },
	state: WalkState,
): boolean {
	const exportName = state.graph.components.find(
		(component) => component.name === state.currentComponentName,
	)?.exportName;
	return state.serverOnlyProps.some(
		({ exportName: owner, propName }) =>
			owner === exportName &&
			((dependency.graphNodeId === PROTOCOL_PROPS_GRAPH_NODE_ID && dependency.path[0] === propName) ||
				dependency.graphNodeId === `${PROTOCOL_PROP_GRAPH_NODE_PREFIX}${propName}`),
	);
}
